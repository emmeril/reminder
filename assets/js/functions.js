
function reminderApp() {
    return {
        // State
        reminders: [],
        sentReminders: [],
        newReminder: {
            phoneNumber: '',
            paymentDate: '',
            reminderTime: '',
            message: ''
        },
        reminderPage: 1,
        reminderPerPage: 6,
        sentReminderPage: 1,
        sentReminderPerPage: 5,
        qrCode: '',

        // Methods
        async init() {
            await this.fetchReminders();
            await this.fetchSentReminders();
            await this.checkWhatsAppStatus();
        },

        async fetchReminders() {
            try {
                const response = await fetch('http://localhost:3000/get-reminders');
                const data = await response.json();
                this.reminders = data.reminders;
            } catch (error) {
                console.error('Error fetching reminders:', error);
            }
        },

        async fetchSentReminders() {
            try {
                const response = await fetch('http://localhost:3000/get-sent-reminders');
                const data = await response.json();
                this.sentReminders = data.sentReminders;
            } catch (error) {
                console.error('Error fetching sent reminders:', error);
            }
        },

        async addReminder() {
            try {
                const response = await fetch('http://localhost:3000/schedule-reminder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.newReminder)
                });
                const data = await response.json();
                if (response.ok) {
                    this.reminders.push(data.reminder);
                    this.resetForm();
                } else {
                    console.error('Error adding reminder:', data.message);
                }
            } catch (error) {
                console.error('Error adding reminder:', error);
            }
        },

        resetForm() {
            this.newReminder = {
                phoneNumber: '',
                paymentDate: '',
                reminderTime: '',
                message: ''
            };
        },

        async checkWhatsAppStatus() {
            try {
                const response = await fetch('http://localhost:3000/qr-code');
                const data = await response.json();
                if (data.qrCode) {
                    this.qrCode = `data:image/png;base64,${data.qrCode}`;
                }
            } catch (error) {
                console.error('Error checking WhatsApp status:', error);
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
        }
    }
}
