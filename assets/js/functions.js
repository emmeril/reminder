function paymentReminder() {
  return {
    phoneNumber: "",
    paymentDate: "",
    reminderTime: "",
    message: "",
    reminders: [],
    isEditing: false,
    currentReminderId: null,

    // Fungsi untuk menjadwalkan pengingat
    scheduleReminder() {
      fetch("http://localhost:3000/schedule-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: this.phoneNumber,
          paymentDate: this.paymentDate,
          reminderTime: this.reminderTime,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorMessage = await response.json();
            throw new Error(
              errorMessage.message || "Terjadi kesalahan pada server"
            );
          }
          return response.json();
        })
        .then((data) => {
          this.message = data.message;
          this.fetchReminders(); // Refresh daftar pengingat setelah menambah pengingat baru
        })
        .catch((error) => {
          this.message = "Terjadi kesalahan: " + error.message;
        });
    },

    // Fungsi untuk mengambil daftar pengingat
    fetchReminders() {
      fetch("http://localhost:3000/get-reminders")
        .then((response) => response.json())
        .then((data) => {
          this.reminders = data.reminders;
        })
        .catch((error) => {
          console.error("Error mengambil pengingat:", error);
        });
    },

    // Fungsi untuk mengedit pengingat
    editReminder(reminder) {
      this.phoneNumber = reminder.phoneNumber;
      this.paymentDate = new Date(reminder.reminderDateTime)
        .toISOString()
        .split("T")[0];
      this.reminderTime = new Date(reminder.reminderDateTime)
        .toISOString()
        .split("T")[1]
        .slice(0, 5);
      this.isEditing = true;
      this.currentReminderId = reminder.id;
    },

    // Fungsi untuk memperbarui pengingat
    updateReminder() {
      fetch(`http://localhost:3000/update-reminder/${this.currentReminderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: this.phoneNumber,
          paymentDate: this.paymentDate,
          reminderTime: this.reminderTime,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorMessage = await response.json();
            throw new Error(
              errorMessage.message || "Terjadi kesalahan pada server"
            );
          }
          return response.json();
        })
        .then((data) => {
          this.message = data.message;
          this.fetchReminders(); // Refresh daftar pengingat setelah memperbarui pengingat
          this.resetForm();
        })
        .catch((error) => {
          this.message = "Terjadi kesalahan: " + error.message;
        });
    },

    // Fungsi untuk menghapus pengingat
    deleteReminder(id) {
      fetch(`http://localhost:3000/delete-reminder/${id}`, {
        method: "DELETE",
      })
        .then((response) => response.json())
        .then((data) => {
          this.message = data.message;
          this.fetchReminders(); // Refresh daftar pengingat setelah menghapus pengingat
        })
        .catch((error) => {
          console.error("Error menghapus pengingat:", error);
        });
    },

    // Fungsi untuk mereset form setelah edit atau tambah pengingat
    resetForm() {
      this.phoneNumber = "";
      this.paymentDate = "";
      this.reminderTime = "";
      this.isEditing = false;
      this.currentReminderId = null;
    },
  };
}

function reminderApp() {
  return {
    // State
    reminders: [],
    sentReminders: [],
    newReminder: {
      phoneNumber: "",
      paymentDate: "",
      reminderTime: "",
      message: "",
    },
    reminderPage: 1,
    reminderPerPage: 6,
    sentReminderPage: 1,
    sentReminderPerPage: 5,
    qrCode: "",

    // Methods
    async init() {
      await this.fetchReminders();
      await this.fetchSentReminders();
      await this.checkWhatsAppStatus();
    },

    async fetchReminders() {
      try {
        const response = await fetch("http://localhost:3000/get-reminders");
        const data = await response.json();
        this.reminders = data.reminders;
      } catch (error) {
        console.error("Error fetching reminders:", error);
      }
    },

    async fetchSentReminders() {
      try {
        const response = await fetch(
          "http://localhost:3000/get-sent-reminders"
        );
        const data = await response.json();
        this.sentReminders = data.sentReminders;
      } catch (error) {
        console.error("Error fetching sent reminders:", error);
      }
    },

    async addReminder() {
      try {
        const response = await fetch(
          "http://localhost:3000/schedule-reminder",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.newReminder),
          }
        );
        const data = await response.json();
        if (response.ok) {
          this.reminders.push(data.reminder);
          this.resetForm();
        } else {
          console.error("Error adding reminder:", data.message);
        }
      } catch (error) {
        console.error("Error adding reminder:", error);
      }
    },

    // Fungsi untuk mengedit pengingat
    async editReminder(reminder) {
      this.phoneNumber = reminder.phoneNumber;
      this.paymentDate = new Date(reminder.reminderDateTime)
        .toISOString()
        .split("T")[0];
      this.reminderTime = new Date(reminder.reminderDateTime)
        .toISOString()
        .split("T")[1]
        .slice(0, 5);
      this.isEditing = true;
      this.currentReminderId = reminder.id;
    },

    // Fungsi untuk memperbarui pengingat
    async updateReminder() {
      fetch(`http://localhost:3000/update-reminder/${this.currentReminderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: this.phoneNumber,
          paymentDate: this.paymentDate,
          reminderTime: this.reminderTime,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorMessage = await response.json();
            throw new Error(
              errorMessage.message || "Terjadi kesalahan pada server"
            );
          }
          return response.json();
        })
        .then((data) => {
          this.message = data.message;
          this.fetchReminders(); // Refresh daftar pengingat setelah memperbarui pengingat
          this.resetForm();
        })
        .catch((error) => {
          this.message = "Terjadi kesalahan: " + error.message;
        });
    },

    resetForm() {
      this.newReminder = {
        phoneNumber: "",
        paymentDate: "",
        reminderTime: "",
        message: "",
      };
    },

    async checkWhatsAppStatus() {
      try {
        const response = await fetch("http://localhost:3000/qr-code");
        const data = await response.json();
        if (data.qrCode) {
          this.qrCode = `data:image/png;base64,${data.qrCode}`;
        }
      } catch (error) {
        console.error("Error checking WhatsApp status:", error);
      }
    },

    // Pagination for Reminders
    get paginatedReminders() {
      const start = (this.reminderPage - 1) * this.reminderPerPage;
      return this.reminders.slice(start, start + this.reminderPerPage);
    },

    prevReminderPage() {
      if (this.reminderPage > 1) {
        this.reminderPage--;
      }
    },

    nextReminderPage() {
      if (this.reminderPage < this.totalReminderPages) {
        this.reminderPage++;
      }
    },

    get totalReminderPages() {
      return Math.ceil(this.reminders.length / this.reminderPerPage);
    },

    // Pagination for Sent Reminders
    get paginatedSentReminders() {
      const start = (this.sentReminderPage - 1) * this.sentReminderPerPage;
      return this.sentReminders.slice(start, start + this.sentReminderPerPage);
    },

    prevSentReminderPage() {
      if (this.sentReminderPage > 1) {
        this.sentReminderPage--;
      }
    },

    nextSentReminderPage() {
      if (this.sentReminderPage < this.totalSentReminderPages) {
        this.sentReminderPage++;
      }
    },

    get totalSentReminderPages() {
      return Math.ceil(this.sentReminders.length / this.sentReminderPerPage);
    },
  };
}
