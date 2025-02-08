require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Joi = require("joi");
const { execSync } = require("child_process");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(
  cors({
    origin: ["http://202.70.133.37"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);
app.use(express.json());
app.use(helmet());
app.use(compression());

let reminders = new Map();
let sentReminders = new Map();
let contacts = new Map();
let qrCodeData = null;
let isAuthenticated = false;

// Simpan secret key JWT di .env
const JWT_SECRET = process.env.JWT_SECRET;

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);
// Slow down excessive requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per windowMs before slowing down
  delayMs: () => 500, // add 500ms delay per request after exceeding limit
});
app.use(speedLimiter);

// simpan file kontak di database/contacts.json
const contactsFilePath = path.join(__dirname, "database", "contacts.json");

// Fungsi untuk menyimpan data ke file JSON
const saveContactsToFile = (contacts) => {
  fs.writeFileSync(
    contactsFilePath,
    JSON.stringify([...contacts.values()], null, 2)
  );
};

// Fungsi untuk memuat data dari file JSON (jika file ada)
const loadContactsFromFile = () => {
  if (fs.existsSync(contactsFilePath)) {
    const data = fs.readFileSync(contactsFilePath, "utf-8");
    const parsedContacts = JSON.parse(data);
    parsedContacts.forEach((contact) => {
      contacts.set(contact.id, contact);
    });
  }
};

// Muat data kontak saat aplikasi dijalankan
loadContactsFromFile();

// simpan file pengingat di database/reminders.json
const remindersFilePath = path.join(__dirname, "database", "reminders.json");

// Fungsi untuk menyimpan data ke file JSON
const saveRemindersToFile = (reminders) => {
  fs.writeFileSync(
    remindersFilePath,
    JSON.stringify([...reminders.values()], null, 2)
  );
};

// Fungsi untuk memuat data dari file JSON (jika file ada)
const loadRemindersFromFile = () => {
  if (fs.existsSync(remindersFilePath)) {
    const data = fs.readFileSync(remindersFilePath, "utf-8");
    const parsedReminders = JSON.parse(data);
    parsedReminders.forEach((reminder) => {
      reminders.set(reminder.id, reminder);
    });
  }
};

// Muat data pengingat saat aplikasi dijalankan
loadRemindersFromFile();

// simpan file pengingat terkirim di database/sent_reminders.json
const sentRemindersFilePath = path.join(
  __dirname,
  "database",
  "sent_reminders.json"
);

// Fungsi untuk menyimpan data ke file JSON
const saveSentRemindersToFile = (sentReminders) => {
  fs.writeFileSync(
    sentRemindersFilePath,
    JSON.stringify([...sentReminders.values()], null, 2)
  );
};

// Fungsi untuk memuat data dari file JSON (jika file ada)
const loadSentRemindersFromFile = () => {
  if (fs.existsSync(sentRemindersFilePath)) {
    const data = fs.readFileSync(sentRemindersFilePath, "utf-8");
    const parsedSentReminders = JSON.parse(data);
    parsedSentReminders.forEach((sentReminder) => {
      sentReminders.set(sentReminder.id, sentReminder);
    });
  }
};

// Muat data pengingat terkirim saat aplikasi dijalankan
loadSentRemindersFromFile();

// Middleware
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

// Schemas untuk user login dan register
const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

// Schema validasi untuk kontak
const contactSchema = Joi.object({
  name: Joi.string().required(),
  phoneNumber: Joi.string().pattern(/^\d+$/).required(),
});

// Schema validasi menggunakan Joi
const reminderSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\d+$/).required(),
  paymentDate: Joi.date().iso().required(),
  reminderTime: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
  message: Joi.string().required(),
});

// Ensure necessary dependencies are installed on Ubuntu Server 20.04
if (process.platform === "linux") {
  try {
    execSync("apt-get update && apt-get install -y libgbm-dev");
    console.log("Dependencies installed successfully.");
  } catch (error) {
    console.error("Failed to install dependencies:", error);
  }
}

// Membuat instance klien WhatsApp
const whatsappClient = new Client({
  authStrategy: new LocalAuth(), // Menyimpan sesi secara lokal
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Menampilkan QR code untuk login
whatsappClient.on("qr", (qr) => {
  const timestamp = new Date().toISOString();

  // Update global state
  qrCodeData = qr;
  isAuthenticated = false;

  // Log QR code with timestamp
  console.log(`[${timestamp}] QR code untuk login dihasilkan.`);

  // Generate QR code in the console
  try {
    qrcode.generate(qr, { small: true });
  } catch (error) {
    console.error(
      `[${timestamp}] Gagal menghasilkan QR code: ${error.message}`
    );
  }
});

// Saat klien siap digunakan
whatsappClient.on("ready", () => {
  console.log("Bot WhatsApp siap digunakan dan terhubung ke akun WhatsApp.");
  isAuthenticated = true;
  qrCodeData = null;
});

whatsappClient.on("disconnected", (reason) => {
  console.error(`Bot WhatsApp terputus: ${reason}`);
  isAuthenticated = false;
});

whatsappClient.on("auth_failure", (msg) => {
  console.error(`Gagal autentikasi: ${msg}`);
  isAuthenticated = false;
});

// Fungsi untuk mengirim pesan ke WhatsApp
const sendWhatsAppMessage = async (phoneNumber, message) => {
  // Input validation
  if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
    console.error("Invalid phone number:", phoneNumber);
    throw new Error("Phone number must be a valid numeric string.");
  }

  if (!message || message.trim().length === 0) {
    console.error("Message cannot be empty.");
    throw new Error("Message must be a non-empty string.");
  }

  try {
    const chatId = `${phoneNumber}@c.us`; // Format chat ID
    await whatsappClient.sendMessage(chatId, message);

    // Log successful message details
    console.log(
      `Pesan berhasil dikirim ke ${phoneNumber} | Panjang pesan: ${
        message.length
      } | Waktu: ${new Date().toISOString()}`
    );
    return { success: true, message: "Message sent successfully." };
  } catch (error) {
    // Provide a more descriptive error for debugging
    console.error(
      `Gagal mengirim pesan ke ${phoneNumber} | Pesan: "${message}" | Error: ${error.message}`
    );
    throw new Error("Failed to send WhatsApp message. Please try again later.");
  }
};

// Fungsi untuk menjalankan cron job
cron.schedule("* * * * *", async () => {
  const now = Date.now();
  console.log(`Menjalankan cron job pada: ${new Date(now).toISOString()}`);

  // Check if there are any reminders to process
  if (reminders.size === 0) {
    console.log("Tidak ada pengingat untuk diproses.");
    return;
  }

  // Iterate over reminders
  for (const [id, reminder] of reminders) {
    try {
      // Check if the reminder time has passed
      if (now >= new Date(reminder.reminderDateTime).getTime()) {
        const message = `Pengingat pembayaran: ${reminder.message}`;

        // Await WhatsApp message sending
        await sendWhatsAppMessage(reminder.phoneNumber, message);

        // Log success and move reminder to sent reminders
        console.log(`Pesan berhasil dikirim ke ${reminder.phoneNumber}`);
        sentReminders.set(id, reminder);
        reminders.delete(id);
      }
    } catch (error) {
      console.error(
        `Gagal mengirim pesan untuk pengingat ID ${id} ke ${reminder.phoneNumber}:`,
        error.message
      );
    }
  }

  // Save reminders and sent reminders to file
  try {
    saveRemindersToFile(reminders);
    saveSentRemindersToFile(sentReminders);
    console.log("Data pengingat berhasil diperbarui.");
  } catch (error) {
    console.error("Gagal menyimpan data pengingat:", error.message);
  }
});

/**
 * Endpoint for user login
 */
app.post("/login", async (req, res) => {
  // Validate input using Joi schema
  const { error, value } = userSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { username, password } = value;

  // Retrieve environment variables
  const envUsername = process.env.ADMIN_USERNAME;
  const envPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!envUsername || !envPassword || !jwtSecret) {
    console.error("Missing required environment variables.");
    return res.status(500).json({
      message:
        "Server configuration error. Please check environment variables.",
    });
  }

  // Validate credentials
  if (username !== envUsername || password !== envPassword) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  // Create JWT token
  try {
    const token = jwt.sign({ username }, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRATION || "1h", // Default to 1 hour if not set
    });
    return res.json({ token });
  } catch (err) {
    console.error("Error creating JWT token:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// Endpoint untuk menambahkan kontak
app.post("/add-contact", authenticateToken, (req, res) => {
  const { error, value } = contactSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { name, phoneNumber } = value;
  const id = Date.now(); // ID unik menggunakan timestamp
  const contact = { id, name, phoneNumber };

  // Tambahkan kontak ke Map
  contacts.set(id, contact);

  // Simpan kontak ke file JSON
  saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil ditambahkan!", contact });
});

// Endpoint untuk mendapatkan daftar all kontak
app.get("/get-all-contacts", authenticateToken, (req, res) => {
  // Pastikan data kontak dimuat dari file JSON jika belum dimuat
  if (contacts.size === 0 && fs.existsSync(contactsFilePath)) {
    loadContactsFromFile(); // Muat data dari file JSON ke Map
  }

  const contactList = Array.from(contacts.values());

  res.json({
    allContacts: contactList,
  });
});

// Endpoint untuk mendapatkan daftar kontak dengan pagination
app.get("/get-contacts", authenticateToken, (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);

  // Pastikan data kontak dimuat dari file JSON jika belum dimuat
  if (contacts.size === 0 && fs.existsSync(contactsFilePath)) {
    loadContactsFromFile(); // Muat data dari file JSON ke Map
  }

  const contactList = Array.from(contacts.values());
  const paginatedContacts = contactList.slice(
    (pageNumber - 1) * limitNumber,
    pageNumber * limitNumber
  );

  res.json({
    page: pageNumber,
    totalPagesContacts: Math.ceil(contactList.length / limitNumber),
    contacts: paginatedContacts,
  });
});

// endpoint untuk memperbarui kontak berdasarkan ID
app.put("/update-contact/:id", authenticateToken, (req, res) => {
  const { id } = req.params; // Ambil ID dari parameter URL
  const contactId = parseInt(id, 10); // Pastikan ID berupa integer
  const { error, value } = contactSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { name, phoneNumber } = value;

  // Cek apakah kontak dengan ID tersebut ada
  if (!contacts.has(contactId)) {
    return res.status(404).json({ message: "Kontak tidak ditemukan!" });
  }

  // Update data kontak
  const updatedContact = { id: contactId, name, phoneNumber };
  contacts.set(contactId, updatedContact);

  // Simpan kontak ke file JSON
  saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil diperbarui!", contact: updatedContact });
});

// Endpoint untuk menghapus kontak berdasarkan ID
app.delete("/delete-contact/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Cek apakah kontak dengan ID tersebut ada
  if (!contacts.has(id)) {
    return res.status(404).json({ message: "Kontak tidak ditemukan!" });
  }

  // Hapus kontak dari Map
  contacts.delete(id);

  // Simpan perubahan ke file JSON
  saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil dihapus!" });
});

// Endpoint untuk menambahkan pengingat
app.post("/add-reminder", authenticateToken, (req, res) => {
  const { error, value } = reminderSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { phoneNumber, paymentDate, reminderTime, message } = value;
  console.log(
    `Received: ${phoneNumber}, ${paymentDate}, ${reminderTime}, ${message}`
  );

  // Ensure the date and time are correctly formatted
  const date = new Date(paymentDate);
  const [year, month, day] = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ];
  const [hours, minutes] = reminderTime.split(":");
  const reminderDateTime = new Date(year, month - 1, day, hours, minutes);
  console.log(`Parsed Date: ${reminderDateTime}`);

  // Ensure the date is correctly parsed
  if (isNaN(reminderDateTime.getTime())) {
    return res.status(400).json({ message: "Invalid date or time format" });
  }

  // ID unik menggunakan timestamp
  const reminder = {
    id: Date.now(),
    phoneNumber,
    reminderDateTime,
    message,
  };

  // Tambahkan pengingat ke Map
  reminders.set(reminder.id, reminder);

  // Simpan pengingat ke file JSON
  saveRemindersToFile(reminders);

  res.json({ message: "Pengingat pembayaran berhasil ditambahkan!", reminder });
});

// Endpoint untuk mendapatkan daftar pengingat dengan pagination
app.get("/get-reminders", authenticateToken, (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);

  // Pastikan data pengingat dimuat dari file JSON jika belum dimuat
  if (reminders.size === 0 && fs.existsSync(remindersFilePath)) {
    loadRemindersFromFile(); // Muat data dari file JSON ke Map
  }

  const reminderList = Array.from(reminders.values());
  const paginatedReminders = reminderList.slice(
    (pageNumber - 1) * limitNumber,
    pageNumber * limitNumber
  );

  res.json({
    page: pageNumber,
    totalPagesReminders: Math.ceil(reminderList.length / limitNumber),
    reminders: paginatedReminders,
  });
});

// Endpoint untuk mendapatkan daftar all pengingat
app.get("/get-all-reminders", authenticateToken, (req, res) => {
  // Pastikan data pengingat dimuat dari file JSON jika belum dimuat
  if (reminders.size === 0 && fs.existsSync(remindersFilePath)) {
    loadRemindersFromFile(); // Muat data dari file JSON ke Map
  }

  const reminderList = Array.from(reminders.values());

  res.json({
    allReminders: reminderList,
  });
});

// Endpoint untuk memperbarui pengingat berdasarkan ID
app.put("/update-reminder/:id", authenticateToken, (req, res) => {
  const { id } = req.params; // Ambil ID dari parameter URL
  const reminderId = parseInt(id, 10); // Pastikan ID berupa integer
  const { error, value } = reminderSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { phoneNumber, paymentDate, reminderTime, message } = value;

  // Cek apakah pengingat dengan ID tersebut ada
  if (!reminders.has(reminderId)) {
    return res.status(404).json({ message: "Pengingat tidak ditemukan!" });
  }

  // Ensure the date and time are correctly formatted
  const date = new Date(paymentDate);
  const [year, month, day] = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ];
  const [hours, minutes] = reminderTime.split(":");
  const reminderDateTime = new Date(year, month - 1, day, hours, minutes);

  // Ensure the date is correctly parsed
  if (isNaN(reminderDateTime.getTime())) {
    return res.status(400).json({ message: "Invalid date or time format" });
  }

  // Update data pengingat
  const updatedReminder = {
    id: reminderId,
    phoneNumber,
    reminderDateTime,
    message,
  };
  reminders.set(reminderId, updatedReminder);

  // Simpan pengingat ke file JSON
  saveRemindersToFile(reminders);

  res.json({
    message: "Pengingat berhasil diperbarui!",
    reminder: updatedReminder,
  });
});

// Endpoint untuk menghapus pengingat berdasarkan ID
app.delete("/delete-reminder/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Cek apakah pengingat dengan ID tersebut ada
  if (!reminders.has(id)) {
    return res.status(404).json({ message: "Pengingat tidak ditemukan!" });
  }

  // Hapus pengingat dari Map
  reminders.delete(id);

  // Simpan perubahan ke file JSON
  saveRemindersToFile(reminders);

  res.json({ message: "Pengingat berhasil dihapus!" });
});

// Endpoint untuk mendapatkan daftar pengingat terkirim dengan pagination
app.get("/get-sent-reminders", authenticateToken, (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);

  // Pastikan data pengingat terkirim dimuat dari file JSON jika belum dimuat
  if (sentReminders.size === 0 && fs.existsSync(sentRemindersFilePath)) {
    loadSentRemindersFromFile(); // Muat data dari file JSON ke Map
  }

  const sentReminderList = Array.from(sentReminders.values());
  const paginatedSentReminders = sentReminderList.slice(
    (pageNumber - 1) * limitNumber,
    pageNumber * limitNumber
  );

  res.json({
    page: pageNumber,
    totalPagesSentReminders: Math.ceil(sentReminderList.length / limitNumber),
    sentReminders: paginatedSentReminders,
  });
});

// Endpoint untuk menjadwalkan ulang pengingat terkirim
app.post("/reschedule-reminder/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Cek apakah pengingat terkirim dengan ID tersebut ada
  if (!sentReminders.has(id)) {
    return res
      .status(404)
      .json({ message: "Pengingat terkirim tidak ditemukan!" });
  }

  const sentReminder = sentReminders.get(id);

  // Tambahkan pengingat ke Map pengingat aktif
  reminders.set(sentReminder.id, sentReminder);

  // Hapus pengingat terkirim dari Map
  sentReminders.delete(id);

  // Simpan perubahan ke file JSON
  saveRemindersToFile(reminders);
  saveSentRemindersToFile(sentReminders);

  res.json({
    message: "Pengingat berhasil dijadwalkan ulang!",
    reminder: sentReminder,
  });
});

// Endpoint untuk mendapatkan status WhatsApp
app.get("/whatsapp-status", authenticateToken, (req, res) => {
  try {
    // Validate the state
    const status = {
      authenticated: Boolean(isAuthenticated),
      qrCode: isAuthenticated ? null : qrCodeData || null, // Provide QR code only if not authenticated
    };

    // Respond with the WhatsApp status
    res.status(200).json(status);
  } catch (error) {
    console.error("Error in /whatsapp-status route:", error);
    res.status(500).json({
      message: "Failed to retrieve WhatsApp status. Please try again later.",
    });
  }
});

// Handle 404 untuk endpoint yang tidak ditemukan
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan" });
});

// Menjalankan server
app.listen(3000, () => {
  console.log("Server berjalan di port 3000");
});

// Menginisialisasi klien WhatsApp
whatsappClient.initialize();
