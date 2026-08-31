import dotenv from "dotenv";
import messageRoutes from "./routes/messageRoutes";
dotenv.config();
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData} from "./types/types";
import { registerOneToOneHandlers } from "./components/oneToOneHandler";
import { registerBroadcastHandlers } from "./components/broadcastHandler";
import { registerRoomHandlers } from "./components/roomHandler";
import { registerGroupHandlers } from "./components/groupHandler";
import { connectDatabase } from "./config/database";


const app = express();

const server = http.createServer(app);

app.use(
    cors({
        origin: "http://localhost:5173"
    })
);

app.use(
    express.json()
);

type IOServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;


const io: IOServer =
    new Server(
        server,
        {
            cors: {
                origin: "http://localhost:5173",
                methods: [ "GET", "POST" ]
            }
        }
    );

app.get( "/", (_req, res) => {
        res.json({
            message: "Socket.IO server is running"
        });
    }
);

app.use("/api/messages", messageRoutes);

io.on(
    "connection",
    (socket) => {
        console.log( "Socket connected:",  socket.id );
        registerOneToOneHandlers( io, socket );
        registerBroadcastHandlers( io, socket );
        registerRoomHandlers(
            io,
            socket
        );
        registerGroupHandlers( io, socket );
    }
);


const PORT = Number( process.env.PORT ) || 5000;
const startServer = async (): Promise<void> => {
    await connectDatabase();
    server.listen(
        PORT,
        () => {
            console.log(  `Server running on port ${PORT}` );
        }
    );
};

startServer();