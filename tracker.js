const Tracker = {
    saveProgress: function(id, currentTime) {
        if (!id || currentTime < 2) return; 
        let history = this.getHistory();
        history[id] = currentTime;
        localStorage.setItem('audioTube_history', JSON.stringify(history));
    },
    getProgress: function(id) {
        let history = this.getHistory();
        return history[id] || 0;
    },
    markAsFinished: function(id) {
        let history = this.getHistory();
        delete history[id]; 
        localStorage.setItem('audioTube_history', JSON.stringify(history));
    },
    getHistory: function() {
        let data = localStorage.getItem('audioTube_history');
        return data ? JSON.parse(data) : {};
    }
};