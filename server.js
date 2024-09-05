const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs"); // Untuk menulis file CSV

const app = express();

app.use(cors());
app.use(bodyParser.json());

let reminders = []; // Array untuk menyimpan jadwal pengingat
let sentReminders = []; // Array untuk menyimpan pengingat yang berhasil terkirim

// Membuat instance klien WhatsApp
const whatsappClient = new Client({
  authStrategy: new LocalAuth(), // Menyimpan sesi secara lokal
});

// Menampilkan QR code untuk login
whatsappClient.on("qr", (qr) => {
  console.log("QR code untuk login:");
  qrcode.generate(qr, { small: true });
});

// Saat klien siap digunakan
whatsappClient.on("ready", () => {
  console.log("Bot WhatsApp siap digunakan dan terhubung ke akun WhatsApp.");
});

// Endpoint untuk menambahkan pengingat
app.post("/schedule-reminder", (req, res) => {
  try {
    const { phoneNumber, paymentDate, reminderTime, message } = req.body;

    // Validasi input
    if (!phoneNumber || !paymentDate || !reminderTime || !message) {
      return res.status(400).json({ message: "Data tidak lengkap!" });
    }

    const reminderDateTime = new Date(`${paymentDate}T${reminderTime}`);
    if (isNaN(reminderDateTime)) {
      return res
        .status(400)
        .json({ message: "Format tanggal atau waktu salah!" });
    }

    // Buat pengingat dengan ID unik
    const reminder = {
      id: Date.now(), // Gunakan timestamp sebagai ID unik
      phoneNumber,
      reminderDateTime,
      message, // Simpan pesan kustom
    };

    // Tambahkan pengingat ke array
    reminders.push(reminder);

    res.json({
      message: "Pengingat pembayaran berhasil dijadwalkan!",
      reminder,
    });
  } catch (error) {
    console.error("Error pada backend:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server!" });
  }
});

// Endpoint untuk mendapatkan daftar pengingat yang terdaftar dengan pagination
app.get("/get-reminders", (req, res) => {
  try {
    const { page = 1, limit = 5 } = req.query;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const startIndex = (pageNumber - 1) * limitNumber;
    const endIndex = pageNumber * limitNumber;

    const paginatedReminders = reminders.slice(startIndex, endIndex);

    res.json({
      page: pageNumber,
      totalPages: Math.ceil(reminders.length / limitNumber),
      reminders: paginatedReminders,
    });
  } catch (error) {
    console.error("Error mendapatkan pengingat:", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat mendapatkan daftar pengingat!",
    });
  }
});

// Endpoint untuk memperbarui pengingat berdasarkan ID
app.put("/update-reminder/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, paymentDate, reminderTime, message } = req.body;

    // Cari pengingat berdasarkan ID
    const reminderIndex = reminders.findIndex(
      (reminder) => reminder.id === parseInt(id)
    );
    if (reminderIndex === -1) {
      return res.status(404).json({ message: "Pengingat tidak ditemukan!" });
    }

    const reminderDateTime = new Date(`${paymentDate}T${reminderTime}`);
    if (isNaN(reminderDateTime)) {
      return res
        .status(400)
        .json({ message: "Format tanggal atau waktu salah!" });
    }

    // Update data pengingat
    reminders[reminderIndex] = {
      ...reminders[reminderIndex],
      phoneNumber,
      reminderDateTime,
      message, // Update pesan kustom
    };

    res.json({
      message: "Pengingat berhasil diperbarui!",
      reminder: reminders[reminderIndex],
    });
  } catch (error) {
    console.error("Error memperbarui pengingat:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan saat memperbarui pengingat!" });
  }
});

// Endpoint untuk menghapus pengingat berdasarkan ID
app.delete("/delete-reminder/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Filter out pengingat yang sesuai dengan ID
    const initialLength = reminders.length;
    reminders = reminders.filter((reminder) => reminder.id !== parseInt(id));

    if (reminders.length === initialLength) {
      return res.status(404).json({ message: "Pengingat tidak ditemukan!" });
    }

    res.json({ message: "Pengingat berhasil dihapus!" });
  } catch (error) {
    console.error("Error menghapus pengingat:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan saat menghapus pengingat!" });
  }
});

// Endpoint untuk mendapatkan pengingat terkirim berdasarkan ID
app.get("/get-sent-reminder/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Cari pengingat terkirim berdasarkan ID
    const sentReminder = sentReminders.find(
      (reminder) => reminder.id === parseInt(id)
    );
    if (!sentReminder) {
      return res
        .status(404)
        .json({ message: "Pengingat terkirim tidak ditemukan!" });
    }

    res.json({ sentReminder });
  } catch (error) {
    console.error("Error mendapatkan pengingat terkirim:", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat mendapatkan pengingat terkirim!",
    });
  }
});

// Endpoint untuk memperbarui pengingat terkirim berdasarkan ID
app.put("/update-sent-reminder/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, reminderDateTime, message } = req.body;

    // Cari pengingat terkirim berdasarkan ID
    const sentReminderIndex = sentReminders.findIndex(
      (reminder) => reminder.id === parseInt(id)
    );
    if (sentReminderIndex === -1) {
      return res
        .status(404)
        .json({ message: "Pengingat terkirim tidak ditemukan!" });
    }

    const updatedReminderDateTime = new Date(reminderDateTime);
    if (isNaN(updatedReminderDateTime)) {
      return res
        .status(400)
        .json({ message: "Format tanggal atau waktu salah!" });
    }

    // Update data pengingat terkirim
    sentReminders[sentReminderIndex] = {
      ...sentReminders[sentReminderIndex],
      phoneNumber,
      reminderDateTime: updatedReminderDateTime,
      message, // Update pesan kustom
    };

    res.json({
      message: "Pengingat terkirim berhasil diperbarui!",
      sentReminder: sentReminders[sentReminderIndex],
    });
  } catch (error) {
    console.error("Error memperbarui pengingat terkirim:", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat memperbarui pengingat terkirim!",
    });
  }
});

// Endpoint untuk menghapus pengingat terkirim berdasarkan ID
app.delete("/delete-sent-reminder/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Cari pengingat terkirim berdasarkan ID
    const initialLength = sentReminders.length;
    sentReminders = sentReminders.filter(
      (reminder) => reminder.id !== parseInt(id)
    );

    if (sentReminders.length === initialLength) {
      return res
        .status(404)
        .json({ message: "Pengingat terkirim tidak ditemukan!" });
    }

    res.json({ message: "Pengingat terkirim berhasil dihapus!" });
  } catch (error) {
    console.error("Error menghapus pengingat terkirim:", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat menghapus pengingat terkirim!",
    });
  }
});

// Fungsi untuk mengirim pesan ke WhatsApp menggunakan whatsapp-web.js
const sendWhatsAppMessage = async (phoneNumber, message) => {
  try {
    const chatId = `${phoneNumber}@c.us`; // Format nomor telepon yang benar
    await whatsappClient.sendMessage(chatId, message);
    console.log(`Pesan berhasil dikirim ke ${phoneNumber}`);
  } catch (error) {
    console.error("Gagal mengirim pesan:", error);
    throw error; // Lempar kesalahan agar pengingat tidak dihapus jika gagal mengirim
  }
};

cron.schedule("* * * * *", async () => {
  const now = new Date();

  // Filter pengingat yang waktunya telah tiba
  const dueReminders = reminders.filter(
    (reminder) => now >= reminder.reminderDateTime
  );

  // Kirim pesan untuk setiap pengingat yang waktunya telah tiba
  const sendPromises = dueReminders.map((reminder) =>
    sendWhatsAppMessage(reminder.phoneNumber, reminder.message)
      .then(() => {
        console.log(
          `Pesan dikirim ke ${reminder.phoneNumber}, pengingat dihapus.`
        );
        sentReminders.push(reminder); // Catat pengingat yang berhasil terkirim
      })
      .catch((error) => {
        console.error("Gagal mengirim pesan:", error);
        return reminder; // Return reminder if failed to send message
      })
  );

  // Tunggu hingga semua pesan selesai dikirim
  const failedReminders = await Promise.all(sendPromises);

  // Update reminders, hapus yang berhasil dikirim
  reminders = reminders.filter(
    (reminder) =>
      !dueReminders.includes(reminder) || failedReminders.includes(reminder)
  );
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
