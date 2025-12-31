const LarkMessages = {
    urgent: [
        "Task này để mốc meo rồi à? Làm ngay!",
        "Bạn hứa xong việc này rồi mà? Tôi rất thất vọng.",
        "Không làm là tôi ám bạn cả đời đấy!",
        "Deadline qua rồi, tự trọng đi!",
        "Alo? Cảnh sát task đâu, bắt lấy kẻ lười biếng này!",
        "Định để tôi nhắc đến bao giờ? Hả?",
        "Hứa thật nhiều, thất hứa thì cũng thật nhiều..."
    ],
    warning: [
        "Ngửi thấy mùi khét của deadline chưa?",
        "30 phút nữa là 'toang'. Liệu hồn!",
        "Nhanh tay lên, tôi đang dõi theo bạn đấy.",
        "Đừng để nước đến chân mới nhảy. Nhảy đi!",
        "Tí nữa là muộn, làm luôn cho nóng!",
        "Cẩn thận, thời gian không chờ đợi ai (và tôi cũng thế)."
    ],
    
    getRandom(type) {
        const list = this[type] || [];
        if (list.length === 0) return "Nhắc nhở nhẹ nhàng...";
        return list[Math.floor(Math.random() * list.length)];
    }
};

// Make it available if used as a module (optional fallback, mostly for testing or specific setups)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LarkMessages;
}
