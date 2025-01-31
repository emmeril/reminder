function reminderApp() {
    return {
        form: {
            phoneNumber: '',
            paymentDate: '',
            reminderTime: '',
            message: '',
            reminderId: ''
        },
        reminders: [],
        currentPage: 1,
        limit: 5,
        totalPages: 1,

        async fetchReminders() {
            const response = await fetch(`http://127.0.0.1:3000/get-reminders?page=${this.currentPage}&limit=${this.limit}`);
            const result = await response.json();
            this.reminders = result.reminders;
            this.totalPages = result.totalPages;
        },

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

        resetForm() {
            this.form = {
                phoneNumber: '',
                paymentDate: '',
                reminderTime: '',
                message: '',
                reminderId: ''
            };
        },

        cancelUpdate() {
            this.resetForm();
        },

        handleUpdate(reminder) {
            this.form.phoneNumber = reminder.phoneNumber;
            this.form.paymentDate = new Date(reminder.reminderDateTime).toISOString().split('T')[0];
            this.form.reminderTime = new Date(reminder.reminderDateTime).toTimeString().split(' ')[0].substring(0, 5);
            this.form.message = reminder.message;
            this.form.reminderId = reminder.id;
        },

        async handleDelete(id) {
            const response = await fetch(`http://127.0.0.1:3000/delete-reminder/${id}`, {
                method: "DELETE",
            });

            const result = await response.json();
            alert(result.message);
            this.fetchReminders();
        },

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
        }
    };
}