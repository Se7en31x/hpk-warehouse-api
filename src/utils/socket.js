// 📂 src/utils/socket.js
const { Server } = require("socket.io");

let io;

const buildUserRoom = (userId) => `USER:${userId}`;
const buildRoleRoom = (role) => `ROLE:${role}`;

module.exports = {
    init: (server) => {
        io = new Server(server, { cors: { origin: "*" } });

        io.on("connection", (socket) => {
            socket.on("REGISTER_NOTIFICATION_CHANNEL", (payload = {}) => {
                const userId = (payload.userId || "").toString().trim();
                const roles = Array.isArray(payload.roles) ? payload.roles : [];

                if (userId) {
                    socket.join(buildUserRoom(userId));
                }

                for (const roleRaw of roles) {
                    const role = (roleRaw || "").toString().trim();
                    if (role) socket.join(buildRoleRoom(role));
                }
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) throw new Error("Socket not initialized");
        return io;
    },
    buildUserRoom,
    buildRoleRoom,
};