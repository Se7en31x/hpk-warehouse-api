// 📂 src/utils/socket.js
const { Server } = require("socket.io");

let io;

const buildUserRoom = (userId) => `USER:${userId}`;
const buildRoleRoom = (role) => `ROLE:${role}`;

module.exports = {
    init: (server) => {
        io = new Server(server, { cors: { origin: "*" } });

        io.on("connection", (socket) => {
            console.log(`[Socket] Client connected | socket.id: ${socket.id}`);

            socket.on("REGISTER_NOTIFICATION_CHANNEL", (payload = {}) => {
                const userId = (payload.userId || "").toString().trim();
                const roles = Array.isArray(payload.roles) ? payload.roles : [];

                if (userId) {
                    socket.join(buildUserRoom(userId));
                    console.log(`[Socket] ${socket.id} joined room USER:${userId}`);
                }

                for (const roleRaw of roles) {
                    const role = (roleRaw || "").toString().trim();
                    if (role) {
                        socket.join(buildRoleRoom(role));
                        console.log(`[Socket] ${socket.id} joined room ROLE:${role}`);
                    }
                }
            });

            socket.on("disconnect", (reason) => {
                console.log(`[Socket] Client disconnected | socket.id: ${socket.id} | reason: ${reason}`);
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