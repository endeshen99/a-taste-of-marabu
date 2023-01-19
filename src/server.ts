import * as Messages from "./messages";
import { checkEquivalent } from "./utils";
import { actionList } from "./actions";
import { canonicalize, canonicalizeEx } from 'json-canonicalize';
import { getPeers, addPeers } from "./pipeline"
import delay from 'delay';
import * as net from 'net';


const PORT = 18018;
//const PEERS = ["45.63.84.226", "45.63.89.228", "144.202.122.8"] // check `pipeline.ts`
var server = net.createServer();
server.on("connection", handleConnection);

const client = new net.Socket();

server.listen(PORT, function () {
  console.log("server listening to %j", server.address());
});

function handleConnection(conn: net.Socket): void {

  function closeConnection() {
    const err_msg = "Time out. Not receiving remaining package."
    console.log(err_msg);
    conn.write(err_msg + "\n");
    conn.destroy();
  }

  var remoteAddress = conn.remoteAddress + ":" + conn.remotePort;
  var buffer: string = "";
  var startedHandshake: boolean = false;
  var timer_id: any;

  console.log("------------------------------------");
  console.log("new client connection from %s\n", remoteAddress);
  conn.setEncoding("utf8");

  initializeConnection(conn);

  conn.on("data", onConnData);
  conn.once("close", onConnClose);
  conn.on("error", onConnError);

  function initializeConnection(conn: any) {
    send(Messages.helloMessage);
    send(Messages.getPeersMessage);
  }

  function onConnData(d: string) {
    console.log("connection data from %s:", remoteAddress);
    timer_id = setTimeout(closeConnection, 30000);
    var data: Messages.messageType, segment: string;
    buffer += d;
    const segments: string[] = buffer.split("\n");
    console.log(segments);
    for (let i = 0; i < segments.length - 1; i++) {
      clearTimeout(timer_id);
      segment = segments[i];
      try {
        data = <Messages.messageType>JSON.parse(segment);
        console.log("\n> Parsed:", data);

        if (!("type" in data) || !actionList.includes(data.type)){
          throwError("INVALID_FORMAT", segment);
          return;
        }
        if (!startedHandshake){
            if (!checkEquivalent<string>(canonicalize(data), Messages.helloMessage.json)){
              throwError("INVALID_HANDSHAKE");
              return;
            }
            startedHandshake = true;
            continue;
        }

      } catch (e) {
        throwError("INVALID_FORMAT", segment)
        return;
      }
      
      var curAction = data.type;
      try {
        dispatchAction(curAction, data);
        
      } catch (e) {
        
      }


    }
    if (segments.length > 1) buffer = segments[segments.length - 1];
    timer_id = setTimeout(closeConnection, 30000);
  }

  function send(message: Messages.messageType): void {
    conn.write(message.json + "\n");
  }

  function throwError(error: string, message: string = ''): void {
    console.log("Error: " + error);
    console.log("Message: " + message);
    send(Messages.ErrorMessageList[error]);
    conn.destroy();
  }

  function dispatchAction(action: string, msg: Messages.messageType): number {
    console.log("Dispatching action: " + action);
    switch (action) {
      case "getpeers":
        send(new Messages.PeersMessage(getPeers()));
        break;
      case "peers":
        msg = <Messages.PeersMessage> msg;
        addPeers(getPeers(),msg.peers);
        break;
      case "hello":
        throwError("INVALID_HANDSHAKE");
        return -1;
      case "error":
        closeConnection();
        return -1;
    }
    return 0;
  }

  function onConnClose() {
    console.log("connection from %s closed", remoteAddress);
    clearTimeout(timer_id);
  }

  function onConnError(err: any) {
    console.log("Connection %s error: %s", remoteAddress, err.message);
  }
}
