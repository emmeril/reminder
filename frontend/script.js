function reminderApp() {
    return {
        // Data form reminder
        form: {
            phoneNumber: '',
            paymentDate: '',
            reminderTime: '',
            message: '',
            reminderId: ''
        },

        // Data reminders
        reminders: [],
        currentPage: 1,
        limit: 5,
        totalPages: 1,

        // Data kontak
        contacts: [],
        contactForm: {
            name: '',
            phoneNumber: ''
        },

        // Template pesan
        messageTemplates: [
            {
                name: "Pembayaran Listrik",
                content: "Hai [Nama], jangan lupa bayar tagihan listrik Rp [Jumlah] sebelum [Tanggal]."
            },
            {
                name: "Pembayaran Sekolah",
                content: "Reminder pembayaran SPP sekolah untuk bulan [Bulan] sebesar Rp [Jumlah]."
            },
            {
                name: "Pembayaran Cicilan",
                content: "Pengingat pembayaran cicilan ke-[Angka] sebesar Rp [Jumlah] jatuh tempo [Tanggal]."
            },
            {
                name: "Tagihan Air",
                content: "Pengingat pembayaran tagihan air bulan [Bulan] sebesar Rp [Jumlah]."
            }
        ],

        // State dropdown
        isDropdownOpen: false,
        isContactDropdownOpen: false,

        /* ------------------------ METHOD UNTUK REMINDER ------------------------ */
        
        // Ambil data reminders
        async fetchReminders() {
            const response = await fetch(`http://127.0.0.1:3000/get-reminders?page=${this.currentPage}&limit=${this.limit}`);
            const result = await response.json();
            this.reminders = result.reminders;
            this.totalPages = result.totalPages;
        },

        // Submit form reminder
        async submitForm() {
            const url = this.form.reminderId ? 
                `http://127.0.0.1:3000/update-reminder/${this.form.reminderId}` : 
                "http://127.0.0.1:3000/schedule-reminder";
            
            const method = this.form.reminderId ? "PUT" : "POST";

            const data = {
                phoneNumber: this.form.phoneNumber,
                paymentDate: this.form.paymentDate,
                reminderTime: this.form.reminderTime,
                message: this.form.message
            };

            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
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
                phoneNumber: '',
                paymentDate: '',
                reminderTime: '',
                message: '',
                reminderId: ''
            };
        },

        // Batalkan update reminder
        cancelUpdate() {
            this.resetForm();
        },

        // Handle update reminder
        handleUpdate(reminder) {
            this.form.phoneNumber = reminder.phoneNumber;
            this.form.paymentDate = new Date(reminder.reminderDateTime).toISOString().split('T')[0];
            this.form.reminderTime = new Date(reminder.reminderDateTime).toTimeString().split(' ')[0].substring(0, 5);
            this.form.message = reminder.message;
            this.form.reminderId = reminder.id;
        },

        // Hapus reminder
        async handleDelete(id) {
            const response = await fetch(`http://127.0.0.1:3000/delete-reminder/${id}`, {
                method: "DELETE",
            });

            const result = await response.json();
            alert(result.message);
            this.fetchReminders();
        },

        /* ------------------------ METHOD UNTUK KONTAK ------------------------ */
        
        // Ambil data kontak
        async fetchContacts() {
            const response = await fetch("http://127.0.0.1:3000/get-contacts");
            const result = await response.json();
            this.contacts = result.contacts;
        },

        // Submit form kontak
        async submitContactForm() {
            const response = await fetch("http://127.0.0.1:3000/add-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.contactForm),
            });

            const result = await response.json();
            alert(result.message);
            this.fetchContacts();
            this.contactForm = { name: '', phoneNumber: '' };
        },

        // Hapus kontak
        async handleDeleteContact(id) {
            const response = await fetch(`http://127.0.0.1:3000/delete-contact/${id}`, {
                method: "DELETE",
            });

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
            this.form.message = template.content
                .replace("[Tanggal]", this.form.paymentDate)
                .replace("[Bulan]", new Date(this.form.paymentDate).toLocaleString('id-ID', { month: 'long' }));
            this.isDropdownOpen = false;
        },

        // Template otomatis dengan data kontak
        applyContactTemplate() {
            const selectedContact = this.contacts.find(
                contact => contact.phoneNumber === this.form.phoneNumber
            );
            
            if (selectedContact) {
                this.form.message = `Hai ${selectedContact.name}, jangan lupa bayar tagihan sebelum ${this.form.paymentDate}.`;
            } else {
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
        }
    };
}