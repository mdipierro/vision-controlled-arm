"use strict";
// Written by Massimo Di Pierro
// License BSD

let RobotMaker = () => {    
    let self = {};
    self.parts = [];
    self.models = {'base':null,'body':null,'arm1':null,'arm2':null,'hand':null};   
    // create scene, light, camera, rendered, and load parts
    self.init = () => {        
        self.scene = new THREE.Scene();      
        self.light = new THREE.AmbientLight(0x333333);
        self.camera = new THREE.Camera(60, window.innerWidth / window.innerHeight, 1, 15000);
        self.renderer = new THREE.WebGLRenderer({antialias: true});
        self.loader = new THREE.JSONLoader();
        // configure scene, camera, light, renderer
        self.scene.addLight(self.light);                
        self.camera.position = {x:0, y:0, z:7000};
        self.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('robot').appendChild(self.renderer.domElement);
        // load and assemble the models parts
        let assembler = (name) => { return (geometry) => {self.assemble(name, geometry);} };
        for(let part in self.models)
            self.loader.load({ model: 'js/robot/robot_arm_'+part+'.js', callback: assembler(part)});
        self.update();
    };
    // store parts and assembled them when all ready
    self.assemble = (name, geometry) => {
        self.models[name] = geometry;                
        for(let part in self.models) if(!self.models[part]) return;
        let material = new THREE.MeshFaceMaterial();
        let mesh = (name) => { return new THREE.Mesh(self.models[name], material); };
        let base = mesh('base');
        let body = new THREE.Object3D();
        let arm1 = new THREE.Object3D();
        let arm2 = new THREE.Object3D();
        let hand = new THREE.Object3D();
        self.parts = [body, arm1, arm2, hand]; // store the parts with joints
        base.addChild(body); // add body to base
        body.addChild(mesh('body')); // add body mesh
        body.addChild(arm1); // add arm to body
        arm1.addChild(mesh('arm1')); // add arm1 mesh
        arm1.addChild(arm2); // add arm2 to arm1
        arm2.addChild(mesh('arm2')); // add arm2 mesh
        arm2.addChild(hand); // add hand to arm2
        hand.addChild(mesh('hand')); // hand mesh
        body.control = 'y';
        arm1.control = arm2.control = hand.control = 'z';
        base.scale = {x:75, y:75, z:75};        
        body.position = {x:0, y:18, z:0}; 
        arm1.position = {x:0, y:-8, z:0};
        arm2.position = {x:-14.5, y:13, z:0};
        hand.position = {x:-18.5, y:5.5, z:0};
        self.scene.addObject(base); // add object to scene
    };
    // loop and render robot
    self.update = () => {
        window.requestAnimationFrame( self.update );
        self.renderer.render( self.scene, self.camera );
    };
    self.init();
    return self;
};

let CameraCapture = () => {
    let self = {};
    self.acc_threshold = 128; // amount of motion to be ignored
    self.webcam = document.getElementById('webcam-source'); // video element associated to the camera
    self.canvasSrc = document.getElementById('canvas-src'); // shows the current frame
    self.canvasDif = document.getElementById('canvas-dif'); // shows the current motion
    self.canvasAcc = document.getElementById('canvas-acc'); // shows the current noise
    self.cs = self.canvasSrc.getContext('2d');
    self.cd = self.canvasDif.getContext('2d');
    self.ca = self.canvasAcc.getContext('2d');
    self.acc = self.cs.createImageData(self.webcam.width, self.webcam.height);
                                       
    self.callback = null;
    // start camera capture
    self.init = () => {
        navigator.getUserMedia({audio: false, video: true}, (stream) => {
                self.webcam.src = URL.createObjectURL(stream);
            }, (e) => { alert('Webcam error!', e); });
	// mirror video
	self.cs.translate(self.canvasSrc.width, 0);
	self.cs.scale(-1, 1);	
        self.update();
    };
    // for each frame, compute difference with previous frame
    self.update = () => {
        let h=self.webcam.height, w=self.webcam.width; 
        self.cs.drawImage(self.webcam, 0, 0, w, h);
        // get webcam image data
        let current = self.cs.getImageData(0, 0, w, h);
        if(self.previous) {
            // create a ImageData instance to receive the blended result
            let delta = self.cs.createImageData(w, h);
            // blend the 2 images
            self.diff(delta.data, self.acc.data, current.data, self.previous.data);
            // draw the result in a canvas
            self.cd.putImageData(delta, 0, 0);
            self.ca.putImageData(self.acc, 0, 0);
            // store the current webcam image
        }
        self.previous = current;
        window.requestAnimationFrame(self.update);
    };
    // compute the difference between two frames, noise, and top point
    self.diff = (data, accumulator, data1, data2) => {
	let acc, rgb, tags, avg1, avg2, val, x, y;
	let width=4*self.webcam.width;
        self.topx = self.topy = self.webcam.height;
	// loop over pixes
	for(let j=0; j<data1.length; j+=4) {	    
	    // compute average pixel data for 3 colors
	    avg1 = (data1[j] + data1[j+1] + data1[j+2]) / 3;
	    avg2 = (data2[j] + data2[j+1] + data2[j+2]) / 3;
	    val = (Math.abs(avg1 - avg2)>21)?255:0;
	    data[j+1] = val;
	    data[j+3] = 255;
	    // accumulate data if pixel is isolated
	    acc = accumulator[j+0];
	    if(acc>0) acc-=1;
	    if(val && j>width) {
		if(data[j-4+1] && data[j-width+1] && acc<self.acc_threshold) {
		    acc = Math.min(acc+10,255);
                    x = j % width; 
                    y = j / width; 
                    if(y<self.topy) {self.topx=x/4; self.topy=y};                    
		}                
	    }
	    accumulator[j+0] = acc;
	    accumulator[j+3] = 255;
	}
        if(self.callback) 
            self.callback(self.topx/self.webcam.width, self.topy/self.webcam.height);
    };
    self.init();
    return self;
};

let camera = CameraCapture();
let robot = RobotMaker();

let vx=[], vy=[];
// when image moves, move the robot, average position of last 10 frames
camera.callback = (x,y) => {
    vx.push(x);
    vy.push(y);
    if(vx.length>10) vx.shift();
    if(vy.length>10) vy.shift();
    let theta = vx.reduce((a,b)=>{return a+b;}, 0)/3;
    let phi = vy.reduce((a,b)=>{return a+b;}, 0)/10-0.5;
    if(robot.parts.length) {
        robot.parts[0].rotation.y = theta;
        robot.parts[1].rotation.z = phi;
        robot.parts[2].rotation.z = phi;
        robot.parts[3].rotation.z = phi;
    }
};