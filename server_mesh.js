/*
IOTNXT MESH SERVER v8
by Rouan van der Ende

INSTALLATION:
    # npm install serialport express socket.io mongojs signalr-client

USAGE
    Plug in USB serial device.
    # node server_mesh.js
    Open browser on localhost:3000

    # npm install forever -g
    # forever -w start server_mesh.js

*/


var version = 316;
console.log('IOTNXT MESH NETWORK v'+version)

var devMode = 0;

var mongojs     = require('mongojs')
var db = mongojs('iotnxt',["mesh"]);

//preset nodecount
var nodecount = 6;

var signalRconnected = false;

var mesh = {}               //all of the mesh data
mesh.messageType = "Test";
mesh.active = false;        //allow auto activity on/off. off by default.
mesh.nodes = [];            //node data
mesh.connections = [];      //connection data
mesh.busy = false;
mesh.idle = false;
mesh.id = "latest";



recalcPossibleConnections();

// ATTEMPT LOAD FROM DATABASE
db.mesh.findOne({id:"latest"}, function(err, dbdata) {
    if (dbdata == null) {
        console.log("DB DATA NOT FOUND.. WILL CREATE")
    } else {
        console.log("FOUND MESH DATA IN DATABASE: LOADING...");
        console.log("====================================")
        console.log(dbdata);
        mesh = dbdata;
        delete mesh._id;
        mesh.nodes.sort(function(a,b) { return a.deviceID - b.deviceID; })
        
        recalcPossibleConnections();

        console.log("====================================")
    }
    
});














var express = require('express');  
var app = express();  
var server = require('http').createServer(app);  
var io = require('socket.io')(server);



app.use(express.static('static'))
app.get('/', function(req, res,next) { res.sendFile(__dirname + '/static/main.htm'); });

if (devMode == 1) {
    server.listen(4000); 
} else {
    server.listen(80); 
}




var SerialPort = require('serialport');
var Readline = SerialPort.parsers.Readline;

var arduino;
var port;
var parser;

parser = new Readline();

var connectinfo = {}
connectinfo.comName = "";
connectinfo.baudRate = 115200;

SerialPort.list(function (err, ports) { 
    console.log(ports);
    for (var p in ports) {
        if (ports[p].manufacturer) {
            if ((ports[p].manufacturer.slice(0,5) == "Atmel")||(ports[p].manufacturer.slice(0,7) == "Arduino")) {
                console.log("connecting."); 
                connectinfo.comName = ports[p].comName
                port = new SerialPort(connectinfo.comName, { baudRate: connectinfo.baudRate });    
                port.pipe(parser);            
                parser.on('data', datahandler);
            
            }
        }
        
    }
});



var lastdata = Date.now();

function datahandler (data) {
    
    lastdata = Date.now();
    var raw = JSON.stringify(data);

    io.sockets.emit("serialport", {raw:raw});        

    try {
            IOTNXTmeshhandler(JSON.parse(data));
        }
    catch(err) {
        console.log("-------------------------");
        console.log("RAW: "+data);
        console.log(err);
        console.log("-------------------------");
            //console.log("api error.");
        
    }
    
}

setInterval( function() {
    //autoRangeNext();
    var now = Date.now();
    var timeSinceLastData = now - lastdata;
    console.log("Lastdata "+timeSinceLastData +" ms ago");

    if (devMode == 1) { 
        
    } else {
        if (timeSinceLastData > 5000) { port.close(function() {
            console.log("port closed");
            process.exit(); 
        })}
    }    


}, 1000);

/* ---------------------------------------------------------------------------------------- */



function recalcPossibleConnections() {
    //UPDATING
    mesh.possibleconnections = [];

    for (var a = 0; a < nodecount; a++) {
        for (var t = 1; t < nodecount; t++) {
            if (a != t) {
                if (a < t) {
                    ////
                    var thisnode = getNode(t);
                    if (thisnode) {
                        if (getNode(t).positionLock == false) {
                            mesh.possibleconnections.push({A:a, T:t});
                        }
                    } else {
                        mesh.possibleconnections.push({A:a, T:t});
                    }
                    ////
                }            
            }
        }
    }

}


console.log(mesh.possibleconnections)

for (var n in mesh.possibleconnections) {
    console.log(mesh.possibleconnections[n])
}


var idlecount = 0;

var IOTNXTmeshhandler = function (data) {
    //console.log(JSON.stringify(data));                
    
    if (data.STATUS == "IDLE") {
        //console.log("idle..")
        
        idlecount++;
        
        //console.log(idlecount);
        if (idlecount>1) { idlecount = 0; autoRangeNext();}
        //autoRangeNext();
    }

    if (data.STATUS == "BUSY") {
        //console.log("busy..")
        mesh.idle = false;
    }

    if (data.CMD == "REPORT") {
        checkLockNodes();
        //console.log(data);
        handleNewRangeReport(data);
        data.timestamp = Date.now();
        
        //UPDATE LOCATIONS
        //newCalcLocations([0,1,2,3])
        //newCalcLocations([1,2,3,4])
        //newCalcLocations([2,3,4,5])

        if (getNode(data.A).positionLock == false) {
            //console.log("must calc position")
            calcPosition(data.A, data.T, data.D);
        }

        if (getNode(data.T).positionLock == false) {
            //console.log("must calc position")
            calcPosition(data.T, data.A, data.D);
        }

        //SOCKET.IO
        io.sockets.emit("report", data);
        io.sockets.emit("mesh", mesh);

        console.log(mesh);

        //SIGNALR
        //console.log(signalRconnected);
        if (signalRconnected == true) {
            //console.log("sending to signalR")
            mesh.blah = Math.random();
            mesh.messageType = "Test";
            iotnxt_send({ messageType: "RabbitMQ.Send", routingKey: "test1", message: mesh}, function (result) { 
                //console.log(result); 
                console.log("SIGNALR SUCCESS.")
            })
        }
        //---
        
    }    
    
    
}

function calcPosition(deviceID, anchorID, distance) {
    console.log("Calculating position for deviceId "+deviceID);
    
    var node = getNode(deviceID);
    var neighbournode = getNode(anchorID)

    //zerotemp
    var diffx = node.x - neighbournode.x;
    var diffy = node.y - neighbournode.y;
    var diffz = node.z - neighbournode.z;
    
    var tempvec = new Vector({x: diffx, y: diffy, z:diffz});
    tempvec = tempvec.Length(distance); //sets length to what we want.

    node.x = tempvec.x + neighbournode.x;
    node.y = tempvec.y + neighbournode.y;
    node.z = tempvec.z + neighbournode.z;

    //nodeTrailTest.push(node)
    
    io.sockets.emit("nodechanged", node);
    updateNode(node);
    io.sockets.emit("mesh", mesh);
}


/* ---------------------------------------------------------------------------------------- */

function checkLockNodes() {
    for (var n in mesh.nodes) {
        if (typeof mesh.nodes[n].positionLock !== 'undefined') {
            //exists
        } else {
            //doesnt exist
            console.log("setting node positionLock to True (default);")
            mesh.nodes[n].positionLock = true;
        }
    }
}

function newCalcLocations(groupNodes) {
    
    //var groupNodes = [3, 2, 4, 6]; // A B C D // WE ASSUME 1 3 5 is already placed.

    // ROTATE TRIANGLE TO 0,0,0 PLANE

    var idA = groupNodes[0]
    var idB = groupNodes[1]
    var idC = groupNodes[2]
    var idD = groupNodes[3]

    var nodeA = getNode(idA);
    var nodeB = getNode(idB);
    var nodeC = getNode(idC);
    var nodeD = getNode(idD);

    //////// LENGTHS    
    var AB = getConnectionDistance(idA,idB);
    var AC = getConnectionDistance(idA,idC);
    var AD = getConnectionDistance(idA,idD);
    var CD = getConnectionDistance(idC,idD);
    var BD = getConnectionDistance(idB,idD);
    var BC = getConnectionDistance(idB,idC);
    
    AsB_m = AB; 
    AsC_m = AC;
    AsD_m = AD; 
    BsC_m = BC;
    BsD_m = BD; 
    CsD_m = CD;
    var AsB_m2 = AsB_m * AsB_m; var AsC_m2 = AsC_m * AsC_m;
    var AsD_m2 = AsD_m * AsD_m; var BsC_m2 = BsC_m * BsC_m;
    var BsD_m2 = BsD_m * BsD_m; var CsD_m2 = CsD_m * CsD_m;
    var qx = AsB_m;
    var rx = (AsB_m2 + AsC_m2 - BsC_m2) / (2.0 * AsB_m);    
    var ry = Math.sqrt (AsC_m2 - rx * rx);
    var sx = (AsB_m2 + AsD_m2 - BsD_m2) / (2.0 * AsB_m);
    var sy = (BsD_m2 - (sx - qx) * (sx - qx) - CsD_m2 + (sx - rx) * (sx - rx) + ry * ry) / (2 * ry);
    var sz = Math.sqrt (AsD_m2 - sx * sx - sy * sy);

    A = new Vector({x: 0.0, y: 0.0, z: 0.0}); 
    B = new Vector({x: qx,  y: 0.0, z: 0.0});
    C = new Vector({x: rx,  y: ry,  z: 0.0}); 
    D = new Vector({x: sx,  y: sy,  z: sz });
    
    //D.z *= -1;

    //FIND ANGLE
    //VECTOR AB
    var vecAB = vectorFromNodes(nodeA, nodeB)
    var vecABtemp = vectorFromNodes(A, B)

    vecAB.normalize();
    vecABtemp.normalize();

    var rotateAngle = vecABtemp.angle(vecAB);

    var rotateVec = new Vector(vecABtemp);
    rotateVec.cross(vecAB);

    rotateVec.normalize();

    A.rotate(rotateVec, rotateAngle);
    B.rotate(rotateVec, rotateAngle);
    C.rotate(rotateVec, rotateAngle);
    D.rotate(rotateVec, rotateAngle);

    //VECTOR AB to Z AXIS
    var zaxis = new Vector({z:-1})
    var zrota  = zaxis.angle(vecAB);
    var zrotv = new Vector(vecAB);
    zrotv.cross(zaxis);
    zrotv.normalize();



    var vecACtemp   = vectorFromNodes(A, C)
    var vecAC       = vectorFromNodes(nodeA, nodeC);
    
    vecACtemp.normalize();
    vecAC.normalize();

    vecACtemp.rotate(zrotv, zrota);
    vecAC.rotate(zrotv, zrota);

    vecACtemp.z = 0;
    vecAC.z = 0;
    vecACtemp.normalize();
    vecAC.normalize();

    //var white = {r:255, g:255, b:255};
    //drawLine(new Vector, vecACtemp, white, white)
    //drawLine(new Vector, vecAC, white, white)

    var finrotangle = vecAC.angle(vecACtemp);
    //console.log(finrotangle)


    A.rotate(vecAB, finrotangle);
    B.rotate(vecAB, finrotangle);
    C.rotate(vecAB, finrotangle);
    D.rotate(vecAB, finrotangle);

    


    //console.log(A)
    //console.log(B)
    //console.log(C)
    //console.log(D)


    //MOVE INTO POSITION
    

    A.x += getNode(idA).x
    A.y += getNode(idA).y
    A.z += getNode(idA).z

    B.x += getNode(idA).x
    B.y += getNode(idA).y
    B.z += getNode(idA).z

    C.x += getNode(idA).x
    C.y += getNode(idA).y
    C.z += getNode(idA).z

    D.x += getNode(idA).x
    D.y += getNode(idA).y
    D.z += getNode(idA).z


    /*drawLine(A, B, idAcol, idBcol);
    drawLine(A, C, idAcol, idCcol);
    drawLine(A, D, idAcol, idDcol);
    drawLine(C, D, idCcol, idDcol);
    drawLine(B, D, idBcol, idDcol);
    drawLine(B, C, idBcol, idCcol);*/
    // CALCULATE IF WE SHOULD FLIP THE Z?

    // NEW LOCATION FOR D

    var newNodeB = getNode(idB);
    newNodeB.x = B.x
    newNodeB.y = B.y
    newNodeB.z = B.z
    updateNode(newNodeB);    

    var newNodeC = getNode(idC);
    newNodeC.x = C.x
    newNodeC.y = C.y
    newNodeC.z = C.z
    updateNode(newNodeC);

    var newNodeD = getNode(idD);
    newNodeD.x = D.x
    newNodeD.y = D.y
    newNodeD.z = D.z
    updateNode(newNodeD);

    // INVERT ROTATION

    console.log(mesh.nodes);
}

function getConnectionDistance(start, end) {
    for (var n in mesh.connections) {
        if ((mesh.connections[n].A == start) && (mesh.connections[n].T == end) ) {
            return mesh.connections[n].distance;
        }
        if ((mesh.connections[n].T == start) && (mesh.connections[n].A == end) ) {
            return mesh.connections[n].distance;
        }        
    }
}

function vectorFromNodes(base, to) {

    var newvecbase = new Vector(base)
    var newvecto = new Vector(to);

    return newvecto.minus(newvecbase);
}

nextAutoRangeConnection = 0;
timeSinceLastAuto = Date.now();

function autoRangeNext() {
    if (mesh.possibleconnections.length > 0 ) {

    
        
        control_range(
            mesh.possibleconnections[nextAutoRangeConnection].A,
            mesh.possibleconnections[nextAutoRangeConnection].T);
            
        if (nextAutoRangeConnection+1 == mesh.possibleconnections.length) { 
            nextAutoRangeConnection = 0
        } else {
            nextAutoRangeConnection++;
        }
    
    } else {
        console.log("no mesh.possibleconnections.")
        console.log(mesh)
    }

        timeSinceLastAuto = Date.now();        
    
}


function control_range(anchor, tag) {
  
    
    //console.log("doing RANGE test on device "+anchor+" and "+tag);    
    var command = {CMD:"RANGE", A:anchor, T:tag, M: "0", S: "5000",  Q:[]}
    console.log("COMMAND:"+JSON.stringify(command));
    port.write(JSON.stringify( command ) );
    //port.drain( function() { console.log("completed."); busyWriting -= 1;} );
  
}

function handleNewRangeReport(inData) {
    
    handleNodeID(inData.A);
    handleNodeID(inData.T);    
    handleNodeConnection(inData.A, inData.T, parseFloat(inData.D));
}

function getNode(inID) {
    var found = 0;
    for (var n in mesh.nodes) {
        if (mesh.nodes[n].deviceID == inID) {
            //update
            found = 1;


            if (typeof mesh.nodes[n].positionLock !== 'undefined') {
                
            } else {
                mesh.nodes[n].positionLock = true;
            }

            return mesh.nodes[n];
            //todo: record time last seen.
        }        
    }
    if (found == 0) { return undefined;}
}

//////////////////////////////////////////////////////////////////////////
// NEW NODES
function handleNodeID(inID) {    
    var found = 0;
    for (var n in mesh.nodes) {
        if (mesh.nodes[n].deviceID == inID) {
            //update
            found = 1;
            //todo: record time last seen.
        }        
    }

    if (found == 0) {
        console.log("Node connected "+inID);
        var newnode = { deviceID: inID, x: 0, y:0, z: 0, lastSeen: 0, positionLock: false }
        mesh.nodes.push(newnode);
    }

    if (found == 1 ) {
        //console.log("updating node lastseen")
        var thisnode = getNode(inID)
        thisnode.lastSeen = 0
        updateNode(thisnode);
    }

}

//////////////////////////////////////////////////////////////////////////

function handleNodeConnection(nodeIdA, nodeIdT, measuredDistance) {
    var found = 0;
    for (var n in mesh.connections) {

        if (mesh.connections[n].A == nodeIdA) 
        {
            if (mesh.connections[n].T == nodeIdT) {
                found = 1;
                //update
                mesh.connections[n].distance = measuredDistance;
                mesh.connections[n].timestamp = Date.now();
                console.log("found connection updating.")
                console.log(mesh.connections[n])
            }            
        }
    }
    
    if (found == 0) {
        console.log("New connection found between "+nodeIdA+" and "+nodeIdT+" with a distance of "+ measuredDistance);
        var newconnection = {A: nodeIdA, T: nodeIdT, distance: measuredDistance, timestamp: Date.now()};
        mesh.connections.push(newconnection);
        
    }

    

    //updateNodePosition(nodeIdA, nodeIdT, measuredDistance);
    if (mesh.connections.length == 6) {
        //updateNodePositionsTetrahedron();
    }

    delete mesh._id;
    //UPDATE DATABASE
    db.mesh.findOne({id:"latest"}, function(err, dbdata) {
        if (dbdata == null) {
            console.log("not found, creating...")
            db.mesh.save(mesh, function(err, dbsave) {
                console.log("saved to db")
            })
        } else {
            db.mesh.update({id:"latest"}, mesh, function(err, updatedbinfo) {
                //console.log("updated db.")
            })
        }
    })
    /*
    db.mesh.updateOne({"id":"latest"}, mesh, {upsert: true}, function(err,data){
        if (err){
            console.log(err);
        }else{
            console.log("mesh db updated succeded");
        }
    })
    */
}

function saveMeshDB(callback) {
    //UPDATE DATABASE
    delete mesh._id;
    db.mesh.findOne({id:"latest"}, function(err, dbdata) {
        if (dbdata == null) {
            console.log("not found, creating...")
            db.mesh.save(mesh, function(err, dbsave) {
                console.log("saved to db")
                callback(err, dbsave);
            })
        } else {
            db.mesh.update({id:"latest"}, mesh, function(err, updatedbinfo) {
                console.log("updated db.")
                callback(err, updatedbinfo);
            })
        }
    })
}

function updateNode(newNodeData) {
    var found = 0;

    for (var n in mesh.nodes) {
        if (mesh.nodes[n].deviceID == newNodeData.deviceID) {
            //update
            //found = n;
            if (newNodeData.positionLock) {
                mesh.nodes[n].positionLock = newNodeData.positionLock;
            }
            
            if (mesh.nodes[n].positionLock == true) {
                console.log("node locked.")
            } else {
                mesh.nodes[n].x = newNodeData.x;
                mesh.nodes[n].y = newNodeData.y;
                mesh.nodes[n].z = newNodeData.z;
            }

            
            //console.log("updated")
            
            //return 1;
            //todo: record time last seen.
        }        
    }
    //if (found == 0) { return undefined;}
}


/* ---------------------------------------------------------------------------------------- */

var signalR = require('signalr-client');

var sr  = new signalR.client("http://10.4.10.10/demo/signalr/",['MessageHub']);

var busyWriting = 0;

io.on('connection', function(client) {  
    console.log('Client connected...');

    console.log("sending fullmesh.")
    io.sockets.emit("fullmesh", mesh)

    client.on('join', function(data) {
        console.log(data);
    });

    /*
    client.on('messages', function(data) {
           client.emit('broad', data);
           client.broadcast.emit('broad',data);
    }); 
    */

    client.on('serial', function(data) {
        /*
        port.flush(function(err) {
            console.log("flushed.")
            console.log(err);
        })
        */

        if (busyWriting > 1) {
            //io.sockets.emit("mesh", {STATUS: "BUSY"})
        } else {
            console.log("WRITE: "+JSON.stringify(data));        
            busyWriting += 1;
            port.write(JSON.stringify(data));
            port.drain( function() { console.log("completed."); busyWriting -= 1;} );
        }
    })

    client.on('mesh', function(data) {

        console.log("incoming mesh update");
        console.log(data);
        //this happens if a client moves a node to place it, and lock its position with .positionLock
        mesh = data;

        recalcPossibleConnections();

        //save to db.
        saveMeshDB(function (err,result) {
            console.log("saving db:");
            console.log(err);
            console.log(result);
        });

        io.sockets.emit("mesh", mesh)
    })




   });
/* ---------------------- */ 




var http = require('http');
var signalR = require('signalr-client');

var client  = new signalR.client(
	"http://10.4.10.10/demo/signalr/",  //signalR service URL
	['messageHub'],                      // array of hubs to be supported in the connection
    2,                                //optional: retry timeout in seconds (default: 10)
    true                              //optional: doNotStart default false
);

client.handlers.messagehub = { // hub name must be all lower case.
	addmessage: function(name, message) { // method name must be all lower case, function signature should match call from hub
		console.log("revc => " + name + ": " + message); 
	}
};

client.serviceHandlers = { //Yep, I even added the merge syntax here.
    bound: function() { console.log("Websocket bound"); 
    
    },
    connectFailed: function(error) { console.log("Websocket connectFailed: ", error); },
    connected: function(connection) { 
        console.log("Websocket connected"); 
        
    },
    disconnected: function() { console.log("Websocket disconnected"); },
    onerror: function (error) { console.log("Websocket onerror: ", error); },
    messageReceived: function (message) { 

        //console.log("------ QUEUE: ------   ")
        //console.log(signalRqueue);
        //console.log("---  SERVER REPLY: ---")
        //console.log("Websocket messageReceived: ", message); 
        //console.log()

        //console.log("TYPE:"+message.type); 
        //console.log("UTF8DATA:"+message.utf8Data); 

        var parsed = JSON.parse(message.utf8Data);
        //console.log("PARSED:"+JSON.stringify(parsed)); 

        //console.log()
        if (parsed.R) {
            var parsedR = JSON.parse(parsed.R);
            //console.log(parsedR)
            //console.log("messageid:"+parsedR.messageID)

            //check queue and do callback.
            for (var q in signalRqueue) {
                if (signalRqueue[q].messageID == parsedR.messageID) {
                    //console.log("FOUND IN QUEUE!")
                    signalRqueue[q].callback(parsedR);
                }
            }
        }


        return false; },
    bindingError: function (error) { console.log("Websocket bindingError: ", error); },
    connectionLost: function (error) { console.log("Connection Lost: ", error); },
    reconnecting: function (retry /* { inital: true/false, count: 0} */) {
        console.log("Websocket Retrying: ", retry);
        //return retry.count >= 3; /* cancel retry true */
        return true; 
    }
};

//Handle Authentication
client.serviceHandlers.onUnauthorized = function (res) {
    console.log("Websocket onUnauthorized:");
    
    //Do your Login Request
    var location = res.headers.location;
    var result = http.get(location, function (loginResult) {
        //Copy "set-cookie" to "client.header.cookie" for future requests
        client.headers.cookie = loginResult.headers['set-cookie'];
    });
}

function getGUID () {
        var d = new Date().getTime();        
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    };

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

var testmsgjson = { messageType: "login", username: "Test1", password: "123", messageID: getGUID() }
var signalRmsg = JSON.stringify(testmsgjson);

/*
setInterval(function () {
    console.log(client.state);
    client.invoke(
		'messagehub', // Hub Name (case insensitive)
		'Send',	// Method Name (case insensitive)
		signalRmsg //additional parameters to match called signature
		);
},2000);
    */

client.start();


/* ********************************** */

var signalRqueue = []

function iotnxt_send(sendmsg, callback) {
    sendmsg.messageID = getGUID();
    signalRqueue.push({sendmsg:sendmsg, callback: callback, messageID : sendmsg.messageID});
    client.invoke('messagehub', 'Send', JSON.stringify(sendmsg));
}



console.log("CONNECTING SIGNALR")
setTimeout( function() {
    iotnxt_send({ messageType: "login", username: "Test1", password: "123"}, function (result) {
        if (result.messageType == "OK") {
            console.log("CONNECTED TO SIGNALR")
            signalRconnected = true;
            
        } else {
            console.log("FAILED TO CONNECT TO SIGNALR")
        }
    })
},5000);



function iotnxtSignalRLogin() {
    iotnxt_send({ messageType: "login", username: "Test1", password: "123"}, function (result) {
        if (result.messageType == "OK") {
            console.log("CONNECTED TO SIGNALR")
            signalRconnected = true;
            
        } else {
            console.log("FAILED TO CONNECT TO SIGNALR")
        }
    })
}


// -------------------------------------








/* ================ THREED ============= */


var Point = function (optional) { 
  if (optional) {
    this.x = optional.x
    this.y = optional.y
  } else {
    this.x = 0
    this.y = 0
  }
}

Point.prototype.scale = function (factor) {
  this.x *= factor
  this.y *= factor
}

function Vector(optional) { 
    this.type = "vector"
    this.x = 0
    this.y = 0
    this.z = 0
    this.w = 0

  if (optional) {
    if (optional.x) {this.x = optional.x}
    if (optional.y) {this.y = optional.y}
    if (optional.z) {this.z = optional.z}
    if (optional.w) {this.w = optional.w}
  }

}

Vector.prototype.x = 0.0
Vector.prototype.y = 0.0
Vector.prototype.z = 0.0
Vector.prototype.w = 0.0

Vector.prototype.length = function () {
  return Math.sqrt( this.x*this.x + this.y*this.y + this.z*this.z )
}


Vector.prototype.Length = function (length) {
  //returns scaled vector to Length
  var newvec = new Vector(this)
  newvec.normalize();
  newvec.scale(length)
  return newvec
}


Vector.prototype.normalize = function() {
  //scales a vector back to a unit vector. It will have a length of 1
  var lengthval = this.length()
  if (lengthval != 0) {
    this.x /= lengthval;
    this.y /= lengthval;
    this.z /= lengthval; 
    return true 
  } else { 
    return false
  }
}

Vector.prototype.tempnormalize = function() {
  //scales a vector back to a unit vector. It will have a length of 1
  var norm = new Vector(this) 
  
  var lengthval = this.length()
  if (lengthval != 0) {
    norm.x /= lengthval;
    norm.y /= lengthval;
    norm.z /= lengthval; 
    return norm 
  } else { 
    return norm
  }
}

Vector.prototype.move = function (point) {
  var p = new Point(point)
  this.x += p.x;
  this.y += p.y;
}

 Vector.prototype.angle = function(bvector) {
  //returns the Angle between two vectors. 0-2PI
  //we create some temporary vectors so we can normalize them savely
  var anorm = new Vector(this)  
  anorm.normalize()
  var bnorm = new Vector(bvector)
  bnorm.normalize()
  var dotval = anorm.dot(bnorm);
  return Math.acos(dotval);
}

Vector.prototype.cross = function(vectorB)
{
  var tempvec = new Vector(this) 
  tempvec.x = (this.y*vectorB.z) - (this.z*vectorB.y);
  tempvec.y = (this.z*vectorB.x) - (this.x*vectorB.z);
  tempvec.z = (this.x*vectorB.y) - (this.y*vectorB.x);
  this.x = tempvec.x
  this.y = tempvec.y
  this.z = tempvec.z
  this.w = tempvec.w
}

Vector.prototype.crossNew = function(vectorB)
{
  var tempvec = new Vector(this) 
  tempvec.x = (this.y*vectorB.z) - (this.z*vectorB.y);
  tempvec.y = (this.z*vectorB.x) - (this.x*vectorB.z);
  tempvec.z = (this.x*vectorB.y) - (this.y*vectorB.x);
  return tempvec
}

Vector.prototype.crossproduct = function(vectorB)
{
  var p1,q1,r1,p2,q2,r2;
  p1 = this.x
  q1 = this.y
  r1 = this.z
  p2 = vectorB.x
  q2 = vectorB.y
  r2 = vectorB.z
  var a,b,c;
  a=(q1*r2)-(q2*r1);
  b=(r1*p2)-(r2*p1);
  c=(p1*q2)-(p2*q1);
  var cross=Math.pow(a,2)+Math.pow(b,2)+Math.pow(c,2);
  var crossres=Math.sqrt(cross);
  return crossres;
}

Vector.prototype.dot = function (vectorB)
{
  //returns the total from multiplying two vectors together. dotproduct
  return this.x*vectorB.x+this.y*vectorB.y+this.z*vectorB.z; 
}

 Vector.prototype.QuaternionMultiply = function(vectorB) {
  var out = new Vector();
  out.w = this.w*vectorB.w - this.x*vectorB.x - this.y*vectorB.y - this.z*vectorB.z;
  out.x = this.w*vectorB.x + this.x*vectorB.w + this.y*vectorB.z - this.z*vectorB.y;
  out.y = this.w*vectorB.y - this.x*vectorB.z + this.y*vectorB.w + this.z*vectorB.x;
  out.z = this.w*vectorB.z + this.x*vectorB.y - this.y*vectorB.x + this.z*vectorB.w;
  this.x = out.x
  this.y = out.y
  this.z = out.z
  this.w = out.w
}

 Vector.prototype.rotate = function (inputaxis, inputangle, center) {


  
  var vector = new Vector(this)
  vector.w = 0

  if (center) {
    if (center.type != "vector") { console.error("error: rotate center is not type vector"+center)}
    // if a center is defined, we use this instead of assuming 0,0,0 as center.
    // this is done by a quick translate to offset the center to 0,0,0 temporarily, and reverted at the end.
    vector.x -= center.x
    vector.y -= center.y
    vector.z -= center.z
  }

  var axis = new Vector({ 
    x: inputaxis.x * Math.sin(inputangle/2),     
    y: inputaxis.y * Math.sin(inputangle/2),     
    z: inputaxis.z * Math.sin(inputangle/2),     
    w: Math.cos(inputangle/2)} 
    )
  
  var axisInv = new Vector({ x: -axis.x, y: -axis.y, z: -axis.z, w: axis.w}  )
  
  axis.QuaternionMultiply(vector)
  axis.QuaternionMultiply(axisInv)

  this.x = axis.x
  this.y = axis.y
  this.z = axis.z

  if (center) {
    // if a center is defined, we use this instead of assuming 0,0,0 as center.
    // this is done by a quick translate to offset the center to 0,0,0 temporarily, and reverted at the end.
    this.x += center.x
    this.y += center.y
    this.z += center.z
  }

}



 Vector.prototype.scale = function (scale) { 
  this.x *= scale
  this.y *= scale
  this.z *= scale
 }

 Vector.prototype.Scale = function (scale) { 
  var a = new Vector(this)
  a.x *= scale
  a.y *= scale
  a.z *= scale
  return a
 }

Vector.prototype.distance = function (vectorb) {
  //returns the distance from this xyz and vectorb's xyz.
  var distance = new Vector()
  distance.x = this.x - vectorb.x;
  distance.y = this.y - vectorb.y;
  distance.z = this.z - vectorb.z;
  return distance;
}

Vector.prototype.add2 = function (vectorb) {
  this.x += vectorb.x
  this.y += vectorb.y
  this.z += vectorb.z
}

Vector.prototype.add = function (vectorb) {
  var addedvector = new Vector()
  addedvector.x = this.x
  addedvector.y = this.y
  addedvector.z = this.z
  addedvector.x += vectorb.x
  addedvector.y += vectorb.y
  addedvector.z += vectorb.z
  return addedvector
}

//capital functions return new object
Vector.prototype.Add = function (vectorb) {
  var addedvector = new Vector()
  addedvector.x = this.x
  addedvector.y = this.y
  addedvector.z = this.z
  addedvector.x += vectorb.x
  addedvector.y += vectorb.y
  addedvector.z += vectorb.z
  return addedvector
}

Vector.prototype.minus = function (vectorb) {
  var addedvector = new Vector()
  addedvector.x = this.x
  addedvector.y = this.y
  addedvector.z = this.z
  addedvector.x -= vectorb.x
  addedvector.y -= vectorb.y
  addedvector.z -= vectorb.z
  return addedvector
}

Vector.prototype.Minus = function (vectorb) {
  var addedvector = new Vector()
  addedvector.x = this.x
  addedvector.y = this.y
  addedvector.z = this.z
  addedvector.x -= vectorb.x
  addedvector.y -= vectorb.y
  addedvector.z -= vectorb.z
  return addedvector
}

/*
  lines.js

  library for two dimensional vectors

  by Rouan van der Ende (fluentart.com)

  2014 04 25
*/

function Line(optional) { 
  if (optional) {
    this.x1 = optional.x1
    this.y1 = optional.y1
    this.z1 = optional.z1
    this.x2 = optional.x2
    this.y2 = optional.y2
    this.z2 = optional.z2
  } else {
	this.x1 = 0.0
	this.y1 = 0.0
  this.z1 = 0.0
	this.x2 = 0.0
	this.y2 = 0.0
  this.z2 = 0.0
  }

  //this.v1 = new Vector({x:this.x1, y:this.y1, z:this.z1})
  //this.v2 = new Vector({x:this.x2, y:this.y2, z:this.z2})  
}

Line.prototype.v1 = function () {
  var v1 = new Vector({x:this.x1, y:this.y1, z:this.z1}) 
  return v1
}

Line.prototype.v2 = function () {
  var v2 = new Vector({x:this.x2, y:this.y2, z:this.z2}) 
  return v2
}

Line.prototype.scale = function (scale) {
	var centerx = (this.x1 + this.x2)/2
	var centery = (this.y1 + this.y2)/2

	var tempx1 = this.x1 - centerx
	var tempy1 = this.y1 - centery
	var tempx2 = this.x2 - centerx
	var tempy2 = this.y2 - centery

	tempx1 *= scale
	tempy1 *= scale
	tempx2 *= scale
	tempy2 *= scale

	tempx1 = tempx1 + centerx
	tempy1 = tempy1 + centery
	tempx2 = tempx2 + centerx
	tempy2 = tempy2 + centery

	this.x1 = tempx1
	this.y1 = tempy1
	this.x2 = tempx2
	this.y2 = tempy2

}



Line.prototype.slope = function () {

	if (this.x2 == this.x1) { return Infinity }
	var slope = (this.y2 - this.y1)/(this.x2 - this.x1)
	return slope
}

Line.prototype.rotate = function (vectoraxis, angle) {
	var tempvec1 = new Vector({x:this.x1, y: this.y1, z:0})
	var tempvec2 = new Vector({x:this.x2, y: this.y2, z:0})
	tempvec1.rotate(vectoraxis,angle)
	tempvec2.rotate(vectoraxis,angle)
	this.x1 = tempvec1.x
	this.y1 = tempvec1.y
	this.x2 = tempvec2.x
	this.y2 = tempvec2.y
}

Line.prototype.nearestLineDistance = function (lineB) {
  /* This gets the length of the shortest line connecting 
     two arbitrary lines in 3d space. Useful to measuring 
     ray to line distance.
  */
  var d,num,den;
  var a1=this.x1
  var b1=this.y1
  var c1=this.z1
  var p1=this.x2 - this.x1
  var q1=this.y2 - this.y1
  var r1=this.z2 - this.z1
  var a2=lineB.x1
  var b2=lineB.y1
  var c2=lineB.z1
  var p2=lineB.x2 - lineB.x1
  var q2=lineB.y2 - lineB.y1
  var r2=lineB.z2 - lineB.z1
  var a12=a1-a2;
  var b12=b1-b2;
  var c12=c1-c2;

   this.direction = new Vector({x:p1, y:q1, z:r1})
   lineB.direction = new Vector({x:p2, y:q2, z:r2})

  var cross=this.direction.crossproduct(lineB.direction)
  if(cross!=0)
  {
    num=((q1*r2-q2*r1)*a12)+((r1*p2-r2*p1)*b12)+((p1*q2-p2*q1)*c12);
    d=Math.abs(num/cross);
    return d;
  }
  else
  {
    var p,q,r;
    p=b12*r1-c12*q1;
    q=c12*p1-a12*r1;
    r=a12*q1-b12*p1;
    var num=Math.sqrt((p*p)+(q*q)+(r*r));
    den=Math.sqrt((p1*p1)+(q1*q1)+(r1*r1));
    d=num/den;
    return d;
  }
}

//calculates the intersection point for this line and another (b)
Line.prototype.intersect = function (b) {
  var atemp = new Line(this)
  var btemp = new Line(b)

  var status = new Vector();
  status.status = 0;
  if (this.equals(b)) {
    //the lines are the same
    status.status = 1;
    return status;
  }

  if (atemp.slope() == btemp.slope()) {
    status.status = 1;
    return status; 
  }

  //swap
  if (atemp.slope() > btemp.slope()) {
    atemp = new Line(b)
    btemp = new Line(this)
  }
  
    //move origin to center of line a    
    var center = new Point(atemp.center());
    center.scale(-1)
    atemp.move(center)
    btemp.move(center)

    ////////////////////////////////////////////
    //rotate all so a lies on y axis

    //find angle to y axis
    var anglevector = new Vector({x:atemp.x1, y:atemp.y1, z:0});
    var yvector = new Vector({x:0,y:1,z:0});
    anglevector.normalize();            
    var angle = anglevector.angle(yvector);
    var zvector = new Vector(anglevector);
    zvector.cross(yvector);
    zvector.normalize();
    //rotate to match y axis
    atemp.rotate(zvector, angle);
    btemp.rotate(zvector, angle);

    ////////////////////////////////////////////////////
    //calculate if/where b intersects with y axis
    var slope = btemp.slope();
    var c = btemp.y1 - slope*btemp.x1;
    var intersectionPoint = new Vector({x:0,y:c,z:0})

    //export for debug
    var testa = new Line(atemp);
    var testb = new Line(btemp); 
    status.testa = testa;
    status.testb = testb;
    status.testc = c

    //test if actual hit on length of atemp
    if ((status.testa.y2 <= c)&&(c <= status.testa.y1)) {
      status.status = 2;
      if ((status.testb.x1 < 0)&&(status.testb.x2 < 0)) { status.status = 1}
      if ((status.testb.x1 > 0)&&(status.testb.x2 > 0)) { status.status = 1}
    }
  
    // reverse transformations to find original position of intersection point
    intersectionPoint.rotate(zvector, -angle);              
    center.scale(-1);
    intersectionPoint.move(center);
    
    status.x = intersectionPoint.x;
    status.y = intersectionPoint.y;
    return status
}

Line.prototype.equals = function (b) {
  if ((this.x1 == b.x1)&&(this.y1 == b.y1)&&(this.x2 == b.x2)&&(this.y2 == b.y2)) {
    return 1
  } else {
    return 0
  }

}

//returns the center point of a line
Line.prototype.center = function () {
    return {x: (this.x1+this.x2)/2 , y: (this.y1+this.y2)/2}
}

//returns the center point of a line
Line.prototype.move = function (point) {
  var p = new Point(point)
  this.x1 += p.x;
  this.y1 += p.y;
  this.x2 += p.x;
  this.y2 += p.y;
}


var same_sign = function ( a,  b){
  return (( a * b) >= 0);
}



var Bone = function (v1, v2) {
  if (v1) {this.v1 = v1} else {this.v1 = new Vector()}
  if (v2) {this.v2 = v2} else {this.v2 = new Vector()}  
}



Bone.prototype.addConstraint = function(constraint) {
  if (constraint.type == "rotationConstraint") {

    this.rotationaxis = constraint.rotationaxis
  }

}


var Circle = function (options) {
  this.position = new Vector({x:options.x, y: options.y, z:options.z})
  if (options.r) {
    this.r = options.r
    this.d = options.r * 2
  } else {
    this.r = 1
    this.d = 2
  }  

}

Circle.prototype.intersect = function (circleB) {
    //move A onto 0,0
    var offset = this.position.Scale(-1)
    this.position.move(offset)
    circleB.position.move(offset)

    //rotate B onto axis
    var xaxis = new Vector({x:1})
    var angle = 0
    var crossvec = new Vector(circleB.position)
    if (this.position.y == circleB.position.y) {
      xaxis = new Vector({x:1})
      if (circleB.position.x < this.position.x) {
        angle = Math.PI
      } else {
        angle = 0;
      }
      crossvec = new Vector({z:1})
      crossvec.cross(xaxis)
      crossvec.normalize();
      circleB.position.rotate(crossvec, angle)
    } else {
      xaxis = new Vector({x:1})
      angle = circleB.position.angle(xaxis)
      crossvec = new Vector(circleB.position)
      crossvec.cross(xaxis)
      crossvec.normalize();
      circleB.position.rotate(crossvec, angle)
    }
    //calculate intersection point
    var d = circleB.position.length()
    var a = 1/d * Math.sqrt( (-d+circleB.r-this.r)*(-d-circleB.r+this.r)*(-d+circleB.r+this.r)*(d+circleB.r+this.r) )    
    var intersectx = (d*d - circleB.r*circleB.r + this.r*this.r)/(2*d)
    var intersectionPoint = new Vector({x:intersectx, y:a/2})
    var intersectionPointB = new Vector({x:intersectx, y:-a/2})
    

    //move/rotate back onto original position
    //circleB.position.rotate(zaxis, 1, this.position)
    circleB.position.rotate(crossvec, -angle)
    intersectionPoint.rotate(crossvec, -angle)
    intersectionPointB.rotate(crossvec, -angle)

    offset.scale(-1)
    this.position.move(offset)
    circleB.position.move(offset)
    intersectionPoint.move(offset)
    intersectionPointB.move(offset)

    var returnobj = {}
    returnobj.pointA = intersectionPoint
    returnobj.pointB = intersectionPointB
    return returnobj
}