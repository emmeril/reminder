function reminderApp() {
  return {
    reminders: [],
    newReminder: {
      phoneNumber: "",
      paymentDate: "",
      reminderTime: "",
      message: "",
    },
    isEditing: false,
    editId: null,
    currentPage: 1,
    itemsPerPage: 5,

    get totalPages() {
      return Math.ceil(this.reminders.length / this.itemsPerPage);
    },

    get paginatedReminders() {
      const start = (this.currentPage - 1) * this.itemsPerPage;
      const end = start + this.itemsPerPage;
      return this.reminders.slice(start, end);
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

    async scheduleReminder() {
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
          console.error(data.message);
        }
      } catch (error) {
        console.error("Error scheduling reminder:", error);
      }
    },

    async updateReminder() {
      try {
        const response = await fetch(
          `http://localhost:3000/update-reminder/${this.editId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(this.newReminder),
          }
        );
        const data = await response.json();
        if (response.ok) {
          const index = this.reminders.findIndex(
            (reminder) => reminder.id === this.editId
          );
          if (index !== -1) {
            this.reminders[index] = data.reminder;
          }
          this.resetForm();
        } else {
          console.error(data.message);
        }
      } catch (error) {
        console.error("Error updating reminder:", error);
      }
    },

    async deleteReminder(id) {
      try {
        const response = await fetch(
          `http://localhost:3000/delete-reminder/${id}`,
          {
            method: "DELETE",
          }
        );
        if (response.ok) {
          this.reminders = this.reminders.filter(
            (reminder) => reminder.id !== id
          );
          if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
          }
        } else {
          console.error("Failed to delete reminder");
        }
      } catch (error) {
        console.error("Error deleting reminder:", error);
      }
    },

    editReminder(reminder) {
      this.newReminder = { ...reminder };
      this.isEditing = true;
      this.editId = reminder.id;
    },

    resetForm() {
      this.newReminder = {
        phoneNumber: "",
        paymentDate: "",
        reminderTime: "",
        message: "",
      };
      this.isEditing = false;
      this.editId = null;
    },

    goToFirstPage() {
      this.currentPage = 1;
    },

    goToLastPage() {
      this.currentPage = this.totalPages;
    },

    goToNextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
      }
    },

    goToPreviousPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
      }
    },

    goToPage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page - 1;
      }
    },

    async init() {
      await this.fetchReminders();
    },
  };
}
