// Auth Function untuk Login/Register
function auth() {
  return {
    isLogin: true,
    form: {
      username: "",
      password: "",
    },

    async submit() {
      const url = this.isLogin ? "/api/login" : "/api/register";

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.form),
        });

        if (response.ok) {
          window.location.href = "app.html";
        } else {
          alert("Error: " + (await response.text()));
        }
      } catch (error) {
        alert("Network error: " + error.message);
      }
    },
  };
}

// Reminder App Function
function reminderApp() {
  return {
    // State
    reminders: [],
    contacts: [],
    messageTemplates: [
      {
        name: "Pengingat Pembayaran",
        text: "Hai, jangan lupa bayar tagihan pada tanggal [tanggal]",
      },
      { name: "Konfirmasi", text: "Konfirmasi pembayaran Anda sudah diterima" },
    ],
    form: {
      phoneNumber: "",
      paymentDate: "",
      reminderTime: "",
      message: "",
      reminderId: null,
    },
    contactForm: {
      name: "",
      phoneNumber: "",
    },
    currentPage: 1,
    itemsPerPage: 5,
    isDropdownOpen: false,
    isContactDropdownOpen: false,
    showQrModal: false,
    qrStatus: "",

    // Toast Function
    showToast(message, type = "success") {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.className = `toast ${type}`;
      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    },

    // Init Function
    init() {
      this.loadReminders();
      this.loadContacts();

      // Auto-refresh setiap 5 menit
      setInterval(() => {
        this.loadReminders();
      }, 300000); // 5 menit dalam milidetik
    },

    // Load Data
    loadReminders() {
      const saved = localStorage.getItem("reminders");
      this.reminders = saved ? JSON.parse(saved) : [];
    },

    loadContacts() {
      const saved = localStorage.getItem("contacts");
      this.contacts = saved ? JSON.parse(saved) : [];
    },

    // Reminder CRUD
    submitForm() {
      const reminderDateTime = new Date(
        `${this.form.paymentDate}T${this.form.reminderTime}`
      ).getTime();

      const reminder = {
        id: this.form.reminderId || Date.now(),
        phoneNumber: this.form.phoneNumber,
        reminderDateTime,
        message: this.form.message,
      };

      if (this.form.reminderId) {
        const index = this.reminders.findIndex(
          (r) => r.id === this.form.reminderId
        );
        this.reminders[index] = reminder;
      } else {
        this.reminders.push(reminder);
      }

      localStorage.setItem("reminders", JSON.stringify(this.reminders));
      this.showToast("Reminder berhasil disimpan!");
      this.resetForm();
    },

    handleUpdate(reminder) {
      const date = new Date(reminder.reminderDateTime);
      this.form = {
        ...reminder,
        paymentDate: date.toISOString().split("T")[0],
        reminderTime: date.toTimeString().slice(0, 5),
      };
    },

    handleDelete(id) {
      this.reminders = this.reminders.filter((r) => r.id !== id);
      localStorage.setItem("reminders", JSON.stringify(this.reminders));
      this.showToast("Reminder dihapus!", "danger");
    },

    // Contact CRUD
    submitContactForm() {
      const contact = {
        id: Date.now(),
        ...this.contactForm,
      };

      this.contacts.push(contact);
      localStorage.setItem("contacts", JSON.stringify(this.contacts));
      this.showToast("Kontak berhasil ditambahkan!");
      this.contactForm = { name: "", phoneNumber: "" };
    },

    handleDeleteContact(id) {
      this.contacts = this.contacts.filter((c) => c.id !== id);
      localStorage.setItem("contacts", JSON.stringify(this.contacts));
      this.showToast("Kontak dihapus!", "danger");
    },

    // Utilities
    resetForm() {
      this.form = {
        phoneNumber: "",
        paymentDate: "",
        reminderTime: "",
        message: "",
        reminderId: null,
      };
    },

    cancelUpdate() {
      this.resetForm();
    },

    applyTemplate(template) {
      this.form.message = template.text;
      this.isDropdownOpen = false;
    },

    selectContact(contact) {
      this.form.phoneNumber = contact.phoneNumber;
      this.isContactDropdownOpen = false;
    },

    // Pagination
    get totalPages() {
      return Math.ceil(this.reminders.length / this.itemsPerPage);
    },

    get paginatedReminders() {
      const start = (this.currentPage - 1) * this.itemsPerPage;
      const end = start + this.itemsPerPage;
      return this.reminders.slice(start, end);
    },

    changePage(page) {
      this.currentPage = page;
    },

    prevPage() {
      if (this.currentPage > 1) this.currentPage--;
    },

    nextPage() {
      if (this.currentPage < this.totalPages) this.currentPage++;
    },

    // Logout
    logout() {
      localStorage.removeItem("auth");
      window.location.href = "index.html";
    },
  };
}

// Toast Element
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }
}
