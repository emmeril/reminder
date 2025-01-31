// Authentication Logic
function auth() {
  return {
    isLogin: true,
    form: { username: "", password: "" },

    async submit() {
      const endpoint = this.isLogin ? "/login" : "/register";

      try {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.form),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        if (this.isLogin) {
          localStorage.setItem("token", data.token);
          window.location.href = "app.html";
        } else {
          alert("Registration successful! Please login.");
          this.isLogin = true;
          this.form = { username: "", password: "" };
        }
      } catch (error) {
        alert(error.message);
      }
    },
  };
}

function reminderApp() {
  return {
    token: localStorage.getItem("token"),
    // Data form reminder
    form: {
      phoneNumber: "",
      paymentDate: "",
      reminderTime: "",
      message: "",
      reminderId: "",
    },

    // Data reminders
    reminders: [],
    currentPage: 1,
    limit: 5,
    totalPages: 1,

    // Data kontak
    contacts: [],
    contactForm: {
      name: "",
      phoneNumber: "",
    },

    // Template pesan
    messageTemplates: [
      {
        name: "Pembayaran Listrik",
        content:
          "Hai [Nama], jangan lupa bayar tagihan listrik Rp [Jumlah] sebelum [Tanggal].",
      },
      {
        name: "Pembayaran Sekolah",
        content:
          "Reminder pembayaran SPP sekolah untuk bulan [Bulan] sebesar Rp [Jumlah].",
      },
      {
        name: "Pembayaran Cicilan",
        content:
          "Pengingat pembayaran cicilan ke-[Angka] sebesar Rp [Jumlah] jatuh tempo [Tanggal].",
      },
      {
        name: "Tagihan Air",
        content:
          "Pengingat pembayaran tagihan air bulan [Bulan] sebesar Rp [Jumlah].",
      },
    ],

    // State dropdown
    isDropdownOpen: false,
    isContactDropdownOpen: false,

    showQrModal: false,
    qrStatus: "Memuat QR Code...",
    qrInterval: null,

    init() {
      if (!this.token) window.location.href = "/";
      this.checkWhatsAppStatus();
      this.fetchReminders(); 
      this.fetchContacts();
    },

    // Di dalam function app() - script.js
    async checkWhatsAppStatus() {
      try {
        const response = await fetch("http://localhost:3000/whatsapp-status", {
          headers: { Authorization: `Bearer ${this.token}` },
        });

        const status = await response.json();

        if (!status.authenticated) {
          this.showQrModal = true;
          if (status.qrCode) {
            this.generateQRCode(status.qrCode);
            this.qrStatus = "Scan QR Code untuk melanjutkan";
          } else {
            this.qrStatus = "Menghubungkan ke WhatsApp...";
          }

          // Mulai interval jika belum ada
          if (!this.qrInterval) {
            this.qrInterval = setInterval(async () => {
              const newStatus = await this.checkWhatsAppStatus();
              if (newStatus?.authenticated) {
                clearInterval(this.qrInterval);
                this.qrInterval = null;
                this.showQrModal = false;
                this.$nextTick(() => {
                  alert("WhatsApp terhubung! Silahkan lanjutkan.");
                });
              }
            }, 2000);
          }
        } else {
          // Jika sudah terautentikasi, pastikan modal ditutup
          this.showQrModal = false;
          clearInterval(this.qrInterval);
          this.qrInterval = null;
          return { authenticated: true };
        }
      } catch (error) {
        console.error("Error checking WhatsApp status:", error);
      }
    },

    generateQRCode(qrData) {
      const container = document.getElementById("qrCodeContainer");
      container.innerHTML = "";

      // Gunakan library QRCode.js
      new QRCode(container, {
        text: qrData,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    },

    /* ------------------------ METHOD UNTUK REMINDER ------------------------ */

    // Ambil data reminders
    async fetchReminders() {
      const response = await fetch(
        `http://127.0.0.1:3000/get-reminders?page=${this.currentPage}&limit=${this.limit}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );
      const result = await response.json();
      this.reminders = result.reminders;
      this.totalPages = result.totalPages;
    },

    // Submit form reminder
    async submitForm() {
      const url = this.form.reminderId
        ? `http://127.0.0.1:3000/update-reminder/${this.form.reminderId}`
        : "http://127.0.0.1:3000/schedule-reminder";

      const method = this.form.reminderId ? "PUT" : "POST";

      const data = {
        phoneNumber: this.form.phoneNumber,
        paymentDate: this.form.paymentDate,
        reminderTime: this.form.reminderTime,
        message: this.form.message,
      };

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      alert(result.message);
      this.fetchReminders();
      this.resetForm();
    },

    // Reset form reminder
    resetForm() {
      this.form = {
        phoneNumber: "",
        paymentDate: "",
        reminderTime: "",
        message: "",
        reminderId: "",
      };
    },

    // Batalkan update reminder
    cancelUpdate() {
      this.resetForm();
    },

    // Handle update reminder
    handleUpdate(reminder) {
      this.form.phoneNumber = reminder.phoneNumber;
      this.form.paymentDate = new Date(reminder.reminderDateTime)
        .toISOString()
        .split("T")[0];
      this.form.reminderTime = new Date(reminder.reminderDateTime)
        .toTimeString()
        .split(" ")[0]
        .substring(0, 5);
      this.form.message = reminder.message;
      this.form.reminderId = reminder.id;
    },

    // Hapus reminder
    async handleDelete(id) {
      const response = await fetch(
        `http://127.0.0.1:3000/delete-reminder/${id}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
        {
          method: "DELETE",
        }
      );

      const result = await response.json();
      alert(result.message);
      this.fetchReminders();
    },

    /* ------------------------ METHOD UNTUK KONTAK ------------------------ */

    // Ambil data kontak
    async fetchContacts() {
      const response = await fetch("http://127.0.0.1:3000/get-contacts", {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const result = await response.json();
      this.contacts = result.contacts;
    },

    // Submit form kontak
    async submitContactForm() {
      const response = await fetch("http://127.0.0.1:3000/add-contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(this.contactForm),
      });

      const result = await response.json();
      alert(result.message);
      this.fetchContacts();
      this.contactForm = { name: "", phoneNumber: "" };
    },

    // Hapus kontak
    async handleDeleteContact(id) {
      const response = await fetch(
        `http://127.0.0.1:3000/delete-contact/${id}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
        {
          method: "DELETE",
        }
      );

      const result = await response.json();
      alert(result.message);
      this.fetchContacts();
    },

    // Pilih kontak dari dropdown
    selectContact(contact) {
      this.form.phoneNumber = contact.phoneNumber;
      this.isContactDropdownOpen = false;
    },

    /* ------------------------ FITUR TAMBAHAN ------------------------ */

    // Pagination
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.fetchReminders();
      }
    },
    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.fetchReminders();
      }
    },
    changePage(page) {
      this.currentPage = page;
      this.fetchReminders();
    },

    // Template pesan
    applyTemplate(template) {
      // Cari kontak berdasarkan nomor telepon yang dipilih
      const selectedContact = this.contacts.find(
        (contact) => contact.phoneNumber === this.form.phoneNumber
      );

      // Jika kontak ditemukan, ganti [Nama] dengan nama kontak
      if (selectedContact) {
        this.form.message = template.content
          .replace("[Nama]", selectedContact.name)
          .replace("[Jumlah]", "[Jumlah]") // Biarkan [Jumlah] sebagai placeholder
          .replace("[Tanggal]", this.form.paymentDate)
          .replace(
            "[Bulan]",
            new Date(this.form.paymentDate).toLocaleString("id-ID", {
              month: "long",
            })
          );
      } else {
        // Jika kontak tidak ditemukan, beri peringatan
        alert("Pilih kontak terlebih dahulu dari dropdown!");
      }
      this.isDropdownOpen = false;
    },

    // Toggle dropdown
    toggleDropdown() {
      this.isDropdownOpen = !this.isDropdownOpen;
    },
    toggleContactDropdown() {
      this.isContactDropdownOpen = !this.isContactDropdownOpen;
    },
    
    logout() {
        localStorage.removeItem("token");
        window.location.href = "/";
      }
  };
}
