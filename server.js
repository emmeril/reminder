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
const fs = require("fs").promises;
const path = require("path");
const app = express();

app.use(
  cors({
    origin: ["http://202.70.133.37", "http://reminder.emmeril-hotspot.shop"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);
// app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(compression());
app.set("trust proxy", 1);

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

// Fungsi untuk menyimpan ke file JSON
const saveMapToFile = async (map, filePath) => {
  try {
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify([...map.values()], null, 2));
    console.log(`Data berhasil disimpan di ${filePath}`);
  } catch (error) {
    console.error(`Gagal menyimpan data ke file ${filePath}: ${error.message}`);
  }
};

// fungsi untuk meload data dari file JSON
const loadMapFromFile = async (filePath, validateFn) => {
  const map = new Map();
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, "utf-8");
    if (!data.trim()) return map;
    const parsed = JSON.parse(data);
    parsed.forEach((item) => {
      if (validateFn(item)) map.set(item.id, item);
      else console.warn(`Data tidak valid: ${JSON.stringify(item)}`);
    });
    console.log(`Data berhasil dimuat dari ${filePath}`);
  } catch (error) {
    console.error(`Gagal memuat data dari file ${filePath}: ${error.message}`);
  }
  return map;
};

// simpan file kontak di database/contacts.json
const contactsFilePath = path.join(__dirname, "database", "contacts.json");

// simpan file pengingat di database/reminders.json
const remindersFilePath = path.join(__dirname, "database", "reminders.json");

// simpan file pengingat terkirim di database/sent_reminders.json
const sentRemindersFilePath = path.join(
  __dirname,
  "database",
  "sent_reminders.json"
);

(async () => {
  contacts = await loadMapFromFile(
    contactsFilePath,
    (c) => c.id && c.name && c.phoneNumber
  );
  reminders = await loadMapFromFile(
    remindersFilePath,
    (r) => r.id && r.phoneNumber && r.reminderDateTime && r.message
  );
  sentReminders = await loadMapFromFile(
    sentRemindersFilePath,
    (s) => s.id && s.phoneNumber && s.reminderDateTime && s.message
  );
})();

await saveMapToFile(contacts, contactsFilePath);
await saveMapToFile(reminders, remindersFilePath);
await saveMapToFile(sentReminders, sentRemindersFilePath);

// Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Token tidak ditemukan atau format salah" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        const errorMessage =
          err.name === "TokenExpiredError"
            ? "Token telah kedaluwarsa"
            : "Token tidak valid";
        return res.status(403).json({ message: errorMessage });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Error di middleware authenticateToken:", error.message);
    return res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
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

// Fungsi untuk menjadwalkan ulang pengingat ke bulan berikutnya
const rescheduleReminderToNextMonth = (reminder) => {
  const currentReminderDate = new Date(reminder.reminderDateTime);
  const nextMonthDate = new Date(
    currentReminderDate.setMonth(currentReminderDate.getMonth() + 1)
  );
  // Format tanggal ke yyyy-mm-dd
  const formattedDate = `${nextMonthDate.getFullYear()}-${(
    nextMonthDate.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${nextMonthDate.getDate().toString().padStart(2, "0")}`;

  let oldMessage = reminder.message;

  // Ganti bulan dan tanggal
  const updatedMessage = oldMessage
    .replace(
      /bulan \w+/,
      `bulan ${nextMonthDate.toLocaleString("id-ID", { month: "long" })}`
    ) // Ganti bulan
    .replace(/\d{4}-\d{2}-\d{2}/, formattedDate); // Ganti tanggal

  // Update reminder date and message
  reminder.phoneNumber;
  reminder.reminderDateTime = nextMonthDate;
  reminder.message = updatedMessage;

  return reminder;
};

// Fungsi untuk menjalankan cron job
cron.schedule("*/1 * * * *", async () => {
  const now = Date.now();
  console.log(`Cron berjalan: ${new Date(now).toISOString()}`);

  const dueReminders = Array.from(reminders.entries()).filter(
    ([, r]) => now >= new Date(r.reminderDateTime).getTime()
  );

  if (dueReminders.length === 0) return;

  await Promise.allSettled(
    dueReminders.map(async ([id, reminder]) => {
      try {
        const message = `Pengingat pembayaran: ${reminder.message}`;
        await sendWhatsAppMessage(reminder.phoneNumber, message);
        sentReminders.set(id, reminder);
        reminders.delete(id);

        const rescheduled = rescheduleReminderToNextMonth({ ...reminder });
        reminders.set(rescheduled.id, rescheduled);
      } catch (err) {
        console.error(`Gagal kirim pengingat ID ${id}: ${err.message}`);
      }
    })
  );

  await saveMapToFile(reminders, remindersFilePath);
  await saveMapToFile(sentReminders, sentRemindersFilePath);
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
app.post("/add-contact", authenticateToken, async (req, res) => {
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
  await saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil ditambahkan!", contact });
});

// Endpoint untuk mendapatkan daftar all kontak
app.get("/get-all-contacts", authenticateToken, async (req, res) => {
  // Pastikan data kontak dimuat dari file JSON jika belum dimuat
  if (
    contacts.size === 0 &&
    (await fs
      .access(contactsFilePath)
      .then(() => true)
      .catch(() => false))
  ) {
    await loadContactsFromFile(); // Muat data dari file JSON ke Map
  }

  const contactList = Array.from(contacts.values());

  res.json({
    allContacts: contactList,
  });
});

// Endpoint untuk mendapatkan daftar kontak dengan pagination
// app.get("/get-contacts", authenticateToken, async (req, res) => {
//   const { page = 1, limit = 5 } = req.query;
//   const pageNumber = parseInt(page, 10);
//   const limitNumber = parseInt(limit, 10);

//   // Pastikan data kontak dimuat dari file JSON jika belum dimuat
//   if (
//     contacts.size === 0 &&
//     (await fs
//       .access(contactsFilePath)
//       .then(() => true)
//       .catch(() => false))
//   ) {
//     await loadContactsFromFile(); // Muat data dari file JSON ke Map
//   }

//   const contactList = Array.from(contacts.values());
//   const paginatedContacts = contactList.slice(
//     (pageNumber - 1) * limitNumber,
//     pageNumber * limitNumber
//   );

//   res.json({
//     page: pageNumber,
//     totalPagesContacts: Math.ceil(contactList.length / limitNumber),
//     contacts: paginatedContacts,
//   });
// });

// endpoint untuk memperbarui kontak berdasarkan ID
app.put("/update-contact/:id", authenticateToken, async (req, res) => {
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
  await saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil diperbarui!", contact: updatedContact });
});

// Endpoint untuk menghapus kontak berdasarkan ID
app.delete("/delete-contact/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Cek apakah kontak dengan ID tersebut ada
  if (!contacts.has(id)) {
    return res.status(404).json({ message: "Kontak tidak ditemukan!" });
  }

  // Hapus kontak dari Map
  contacts.delete(id);

  // Simpan perubahan ke file JSON
  await saveContactsToFile(contacts);

  res.json({ message: "Kontak berhasil dihapus!" });
});

// Endpoint untuk menambahkan pengingat
app.post("/add-reminder", authenticateToken, async (req, res) => {
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
  await saveRemindersToFile(reminders);

  res.json({ message: "Pengingat pembayaran berhasil ditambahkan!", reminder });
});

// Endpoint untuk mendapatkan daftar pengingat dengan pagination
// app.get("/get-reminders", authenticateToken, async (req, res) => {
//   const { page = 1, limit = 5 } = req.query;
//   const pageNumber = parseInt(page, 10);
//   const limitNumber = parseInt(limit, 10);

//   // Pastikan data pengingat dimuat dari file JSON jika belum dimuat
//   if (
//     reminders.size === 0 &&
//     (await fs
//       .access(remindersFilePath)
//       .then(() => true)
//       .catch(() => false))
//   ) {
//     await loadRemindersFromFile(); // Muat data dari file JSON ke Map
//   }

//   const reminderList = Array.from(reminders.values());
//   const paginatedReminders = reminderList.slice(
//     (pageNumber - 1) * limitNumber,
//     pageNumber * limitNumber
//   );

//   res.json({
//     page: pageNumber,
//     totalPagesReminders: Math.ceil(reminderList.length / limitNumber),
//     reminders: paginatedReminders,
//   });
// });

// Endpoint untuk mendapatkan daftar all pengingat
app.get("/get-all-reminders", authenticateToken, async (req, res) => {
  // Pastikan data pengingat dimuat dari file JSON jika belum dimuat
  if (
    reminders.size === 0 &&
    (await fs
      .access(remindersFilePath)
      .then(() => true)
      .catch(() => false))
  ) {
    await loadRemindersFromFile(); // Muat data dari file JSON ke Map
  }

  const reminderList = Array.from(reminders.values());

  res.json({
    allReminders: reminderList,
  });
});

// Endpoint untuk memperbarui pengingat berdasarkan ID
app.put("/update-reminder/:id", authenticateToken, async (req, res) => {
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
  await saveRemindersToFile(reminders);

  res.json({
    message: "Pengingat berhasil diperbarui!",
    reminder: updatedReminder,
  });
});

// Endpoint untuk menghapus pengingat berdasarkan ID
app.delete("/delete-reminder/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Cek apakah pengingat dengan ID tersebut ada
  if (!reminders.has(id)) {
    return res.status(404).json({ message: "Pengingat tidak ditemukan!" });
  }

  // Hapus pengingat dari Map
  reminders.delete(id);

  // Simpan perubahan ke file JSON
  await saveRemindersToFile(reminders);

  res.json({ message: "Pengingat berhasil dihapus!" });
});

// Endpoint untuk mendapatkan daftar pengingat terkirim dengan pagination
app.get("/get-sent-reminders", authenticateToken, async (req, res) => {
  // Pastikan data pengingat terkirim dimuat dari file JSON jika belum dimuat
  if (
    sentReminders.size === 0 &&
    (await fs
      .access(sentRemindersFilePath)
      .then(() => true)
      .catch(() => false))
  ) {
    await loadSentRemindersFromFile(); // Muat data dari file JSON ke Map
  }

  const sentReminderList = Array.from(sentReminders.values());

  res.json({
    sentReminders: sentReminderList,
  });
});

// Endpoint untuk menjadwalkan ulang pengingat terkirim
app.post("/reschedule-reminder/:id", authenticateToken, async (req, res) => {
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
  await saveRemindersToFile(reminders);
  await saveSentRemindersToFile(sentReminders);

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
