require('dotenv').config(); // Untuk menggunakan environment variables
const express = require("express");
const cron = require("node-cron");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Joi = require("joi");
const { v4: uuidv4 } = require('uuid'); // Untuk ID unik
const winston = require('winston'); // Untuk logging

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123!"; // Gunakan environment variable

// Konfigurasi logging dengan winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

app.use(cors());
app.use(express.json());

let users = [];
let reminders = new Map();
let sentReminders = new Map();
let contacts = new Map();

// Middleware untuk autentikasi JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Schema validasi menggunakan Joi
const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

const contactSchema = Joi.object({
  name: Joi.string().required(),
  phoneNumber: Joi.string().pattern(/^62\d+$/).required(), // Validasi nomor Indonesia
});

const reminderSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^62\d+$/).required(), // Validasi nomor Indonesia
  paymentDate: Joi.date().iso().required(),
  reminderTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
  message: Joi.string().required(),
});

// Routes
app.post("/register", async (req, res) => {
  try {
    const { error, value } = userSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { username, password } = value;
    if (users.some((u) => u.username === username)) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: uuidv4(), username, password: hashedPassword });
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    logger.error("Error in /register:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { error, value } = userSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { username, password } = value;
    const user = users.find((u) => u.username === username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (error) {
    logger.error("Error in /login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Protected Routes
app.use(authenticateToken);

app.post("/add-contact", (req, res) => {
  try {
    const { error, value } = contactSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { name, phoneNumber } = value;
    const id = uuidv4(); // ID unik menggunakan UUID
    const contact = { id, name, phoneNumber };

    contacts.set(id, contact);
    res.json({ message: "Kontak berhasil ditambahkan!", contact });
  } catch (error) {
    logger.error("Error in /add-contact:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/get-contacts", (req, res) => {
  try {
    const contactList = Array.from(contacts.values());
    res.json({ contacts: contactList });
  } catch (error) {
    logger.error("Error in /get-contacts:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/delete-contact/:id", (req, res) => {
  try {
    const id = req.params.id;
    if (!contacts.delete(id)) {
      return res.status(404).json({ message: "Kontak tidak ditemukan!" });
    }
    res.json({ message: "Kontak berhasil dihapus!" });
  } catch (error) {
    logger.error("Error in /delete-contact:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

let qrCodeData = null;
let isAuthenticated = false;

// Membuat instance klien WhatsApp
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
});

whatsappClient.on("qr", (qr) => {
  logger.info("QR code untuk login:");
  qrcode.generate(qr, { small: true });
  qrCodeData = qr;
  isAuthenticated = false;
});

whatsappClient.on("ready", () => {
  logger.info("Bot WhatsApp siap digunakan dan terhubung ke akun WhatsApp.");
  isAuthenticated = true;
  qrCodeData = null;
});

whatsappClient.on("disconnected", () => {
  logger.warn("Client WhatsApp disconnected");
  isAuthenticated = false;
});

app.get("/whatsapp-status", (req, res) => {
  res.json({
    authenticated: isAuthenticated,
    qrCode: qrCodeData,
  });
});

app.post("/schedule-reminder", async (req, res) => {
  try {
    const { error, value } = reminderSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { phoneNumber, paymentDate, reminderTime, message } = value;
    const date = new Date(paymentDate);
    const [hours, minutes] = reminderTime.split(":");

    // Gunakan UTC untuk menghindari masalah timezone
    const reminderDateTime = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes
    ));

    if (isNaN(reminderDateTime.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format" });
    }

    const reminder = {
      id: uuidv4(),
      phoneNumber,
      reminderDateTime,
      message,
    };

    reminders.set(reminder.id, reminder);
    res.json({ message: "Pengingat pembayaran berhasil dijadwalkan!", reminder });
  } catch (error) {
    logger.error("Error in /schedule-reminder:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ... endpoint lainnya (get-reminders, update-reminder, delete-reminder) ...

// Fungsi untuk mengirim pesan ke WhatsApp
const sendWhatsAppMessage = async (phoneNumber, message) => {
  try {
    if (!isAuthenticated) throw new Error("WhatsApp client not ready");
    const chatId = `${phoneNumber}@c.us`;
    await whatsappClient.sendMessage(chatId, message);
    logger.info(`Pesan berhasil dikirim ke ${phoneNumber}`);
  } catch (error) {
    logger.error("Gagal mengirim pesan:", error);
    throw error;
  }
};

// Cron job untuk mengirim pengingat
cron.schedule("* * * * *", async () => {
  const now = new Date();
  for (const reminder of reminders.values()) {
    if (now >= reminder.reminderDateTime) {
      try {
        await sendWhatsAppMessage(reminder.phoneNumber, reminder.message);
        sentReminders.set(reminder.id, reminder);
        reminders.delete(reminder.id);
      } catch (error) {
        logger.error(`Gagal mengirim pengingat ke ${reminder.phoneNumber}`);
      }
    }
  }
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan" });
});

// Menjalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server berjalan di port ${PORT}`);
});

// Menginisialisasi klien WhatsApp
whatsappClient.initialize();