function reminderApp() {
    return {
        // Data form
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

        // Method untuk mengambil data reminders
        async fetchReminders() {
            const response = await fetch(`http://127.0.0.1:3000/get-reminders?page=${this.currentPage}&limit=${this.limit}`);
            const result = await response.json();
            this.reminders = result.reminders;
            this.totalPages = result.totalPages;
        },

        // Method untuk submit form
        async submitForm() {
            const url = this.form.reminderId ? `http://127.0.0.1:3000/update-reminder/${this.form.reminderId}` : "http://127.0.0.1:3000/schedule-reminder";
            const method = this.form.reminderId ? "PUT" : "POST";

            const data = {
                phoneNumber: this.form.phoneNumber,
                paymentDate: this.form.paymentDate,
                reminderTime: this.form.reminderTime,
                message: this.form.message
            };

            const response = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            alert(result.message);
            this.fetchReminders();
            this.resetForm();
        },

        // Method untuk mereset form
        resetForm() {
            this.form = {
                phoneNumber: '',
                paymentDate: '',
                reminderTime: '',
                message: '',
                reminderId: ''
            };
        },

        // Method untuk membatalkan update
        cancelUpdate() {
            this.resetForm();
        },

        // Method untuk mengisi form dengan data reminder yang akan diupdate
        handleUpdate(reminder) {
            this.form.phoneNumber = reminder.phoneNumber;
            this.form.paymentDate = new Date(reminder.reminderDateTime).toISOString().split('T')[0];
            this.form.reminderTime = new Date(reminder.reminderDateTime).toTimeString().split(' ')[0].substring(0, 5);
            this.form.message = reminder.message;
            this.form.reminderId = reminder.id;
        },

        // Method untuk menghapus reminder
        async handleDelete(id) {
            const response = await fetch(`http://127.0.0.1:3000/delete-reminder/${id}`, {
                method: "DELETE",
            });

            const result = await response.json();
            alert(result.message);
            this.fetchReminders();
        },

        // Method untuk pindah ke halaman sebelumnya
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.fetchReminders();
            }
        },

        // Method untuk pindah ke halaman berikutnya
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.fetchReminders();
            }
        },

        // Method untuk pindah ke halaman tertentu
        changePage(page) {
            this.currentPage = page;
            this.fetchReminders();
        },

        // Method untuk mengaplikasikan template pesan
        applyTemplate(template) {
            this.form.message = template.content;
            this.isDropdownOpen = false;
        },

        // Method untuk toggle dropdown
        toggleDropdown() {
            this.isDropdownOpen = !this.isDropdownOpen;
        },

        isDropdownOpen: false
    };
}