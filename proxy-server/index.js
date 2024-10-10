const rethinkdb = require("rethinkdb");
const mqtt = require("mqtt");
const Pusher = require("pusher");

const pusherKey = process.env.REACT_APP_PUSHER_APP_KEY;
const pusherSecret = process.env.REACT_APP_PUSHER_APP_SECRET;
const pusherID = process.env.REACT_APP_PUSHER_APP_ID;
const pusherCluster = process.env.REACT_APP_PUSHER_CLUSTER;

const pusher = new Pusher({
  appId: pusherID,
  key: pusherKey,
  secret: pusherSecret,
  cluster: pusherCluster,
  useTLS: false,
  host: "soketi",
  port: 6001,
});

const emitDataToSoketi = (channel, event, data) => {
  pusher
    .trigger(channel, event, data)
    .then((response) => {
      console.log("Data emitted successfully:", response.status);
    })
    .catch((error) => {
      console.error("Error emitting data to Soketi:", error);
    });
};const watchRethinkDBChanges = (conn) => {
  rethinkdb
    .db("test")
    .table("messages")
    .changes()
    .run(conn, (err, cursor) => {
      if (err) throw err;

      cursor.each((err, row) => {
        if (err) throw err;
        console.log("RethinkDB change detected:", row);
        emitDataToSoketi("my-channel", "message", { message: row });
      });
    });
};


const startProxyServer = async () => {
  rethinkdb.connect({ host: "rethinkdb", port: 28015 }, (err, conn) => {
    if (err) throw err;

    // Create the messages table if it doesn't exist
    rethinkdb
      .db("test")
      .tableList()
      .run(conn, (err, tables) => {
        if (err) throw err;

        if (!tables.includes("messages")) {
          rethinkdb
            .db("test")
            .tableCreate("messages", { primaryKey: "id" })
            .run(conn, (err, result) => {
              if (err) throw err;

              console.log("Messages table created");
              // Now that the table is created, we can start listening for changes

              watchRethinkDBChanges(conn);
            });
        } else {
          console.log("Messages table already exists");
          // If the table already exists, we can start listening for changes immediately

          watchRethinkDBChanges(conn);
        }
      });
  });

  // 2. HiveMQ Pub/Sub Setup
  const mqttClient = mqtt.connect("mqtt://hivemq:1883");

  mqttClient.on("connect", () => {
    console.log("Connected to HiveMQ");
    mqttClient.subscribe("test/topic");
  });

  mqttClient.on("message", (topic, message) => {
    console.log(`Message from HiveMQ: ${message.toString()}`);
    emitDataToSoketi("my-channel", "message", { message: message });
  });
};

startProxyServer();
