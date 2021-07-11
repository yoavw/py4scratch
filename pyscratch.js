// Used with pyscratch.py and sbx2py.py.
// Acts as a bridge between Scratch and Python, allowing full control of Scratch from a Python program.
//
// Adjusting from the old scratchx module to scratch 3.0
//
// Copyright (C) 2017 Yoav Weiss (weiss.yoav@gmail.com)

console.log("test59");

class Pyscratch {

	constructor() {
		this.vars = Object();
		this.cmds = Object();
		this.url = 'http://localhost:9000/';
		this.uuid = '';
		this.completed = {};
		this.disconnected = false;
		this.loaded = false;
		this.fetching = {};
		this.concurrency_check = 0;

		//window.JSshowWarning = function(){console.log('ext loaded');return true;};
	}

	fetchCloneID(obj_name, cur_id, callback) {
		var data = { 'uuid' : this.uuid, 'name' : obj_name, 'cur_clone_id' : cur_id };
		return fetch(this.url+'new', {
			method: 'POST',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		}).then(res => res.json()).catch(error => {
			console.log(error);
			return {"clone_id":"DISCONNECTED","error":error};
		}).then(res => callback(res, this));
	}

	fetchCommand(name, callback) {
		var v = {'uuid':this.uuid, 'name':name};
		var comp = [];
		var w,k;
		if (!(name in this.completed))
			this.completed[name] = []
		while ((w = this.completed[name].shift()))
			comp.push(w);
		v['completed'] = JSON.stringify(comp);

		// Get vars for all clones of this object
		for (k in this.vars) {
			if (k.startsWith(name+'-')) {
				v[k] = JSON.stringify(this.vars[k]);
			}
		}

		return fetch(this.url+'fetchcmd', {
			method: 'POST',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(v)
		}).then(res => res.json()).catch(error => {
			console.log(error);
			return {"clone_id":"UNKNOWN","cmds":[{"cmd":"DISCONNECTED","clone_id":"UNKNOWN"}],"error":error};
		}).then(res => callback(res, this));
	}

	deliverEvent(event_name, event_arg, clone_id, callback) {
		var d = { 'uuid' : this.uuid, 'clone_id' : clone_id, 'event' : event_name, 'arg' : event_arg, 'vars' : JSON.stringify(this.vars[clone_id]) };

		return fetch(this.url+'event', {
			method: 'POST',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(d)
		}).then(res => res.json()).catch(error => {
			console.log(error);
			return {"clone_id":"DISCONNECTED","error":error};
		}).then(res => callback(res, this));
	}

	deliverVar(name, value, callback) {
		var d = { 'uuid' : this.uuid, 'name' : name, 'value' : value };

		return fetch(this.url+'newvar', {
			method: 'POST',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(d)
		}).then(res => res.json()).catch(error => {
			console.log(error);
			return {"clone_id":"DISCONNECTED","error":error};
		}).then(res => callback(res, this));
	}

	deliverStart(callback) {
		var d = { 'uuid' : this.uuid };

		return fetch(this.url+'start', {
			method: 'POST',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(d)
		}).then(res => res.json()).catch(error => {
			console.log(error);
			return {"clone_id":"DISCONNECTED","error":error};
		}).then(res => callback(res, this));
	}

	// Cleanup function when the extension is unloaded
	_shutdown() {this.loaded = false;}

	// Status reporting code
	// Use this to report missing hardware, plugin or unsupported browser
	_getStatus() {
		return {status: 2, msg: 'Ready'};
	}

	setVar({name,value,clone_id}) {
		this.vars[clone_id][name] = value;
		//console.log('Set '+name+' = '+value+' for '+clone_id);
		return;
	}

	removeVar({name,clone_id}) {
		delete this.vars[clone_id][name];
		//console.log('Removed var '+name+' for '+clone_id);
		return;
	}

	setUrl({u}) {
		this.url = u;
		console.log('Set url to '+this.url);
		return;
	}

	getCommandArg({arg_name, clone_id}) {
		if (!clone_id.includes('-')) {
			// First object (non-clone) on first run
			return 'get_clone_id';
		} else if (!(clone_id in this.cmds)) {
			// Unknown object (python restarted, scratch hasn't)
			return 'get_clone_id';
		}
		return this.vars[clone_id].cmd_args[arg_name];
	}

	getNextCommand({clone_id}) {
		if (clone_id in this.cmds) {
			if (('cmd_args' in this.vars[clone_id]) && ('wait' in this.vars[clone_id].cmd_args)) {
				var name = clone_id.substring(0, clone_id.lastIndexOf("-"))
				this.completed[name].push(this.vars[clone_id].cmd_args.wait);
			} else if (('cmd_args' in this.vars[clone_id]) && ('cmd' in this.vars[clone_id].cmd_args) &&
					   this.vars[clone_id].cmd_args.cmd == 'DISCONNECTED') {
				this.disconnected = false;	// Time to retry
			}
			var cmdq = this.cmds[clone_id];
			if (cmdq.length == 0) {
				this.vars[clone_id].cmd_args = {};
				return true;	// Abort loop until next broadcast
			}
			this.vars[clone_id].cmd_args = cmdq.shift();
		}
		return false;
	}

	getCommands({name}) {
		if (name in this.fetching)
			return;
		this.concurrency_check++;
		console.log(this.concurrency_check);
		this.fetching[name] = true;
		this.fetchCommand(name, function(data, pyscratch) {
		//return this.fetchCommand(name, function(data, pyscratch) {
			var c,k;
			//console.log(data);
			for (c in data.cmds) {
				var cmd_args = data.cmds[c];
				var clone_id = cmd_args.clone_id;
				if (cmd_args.cmd == 'forget') {
					// Delete stale clone vars
					//console.log("forgetting "+cmd_args.forget_clone_id);
					delete pyscratch.vars[cmd_args.forget_clone_id];
					delete pyscratch.cmds[cmd_args.forget_clone_id];
				} else if (cmd_args.cmd == 'js' && clone_id in pyscratch.vars && 'script' in cmd_args) {
					try {
						var res = eval(cmd_args.script);
						if (res)
							pyscratch.vars[clone_id]['js_result'] = res;
						else
							pyscratch.vars[clone_id]['js_result'] = '';
					} catch(err) {
						pyscratch.vars[clone_id]['js_result'] = 'error: '+err;
					}
				} else if (cmd_args.cmd == 'flush') {
					for (k in pyscratch.cmds) {
						//if (k.startsWith(name+'-')) {
							pyscratch.cmds[k] = [];
						//}
					}
				} else if (cmd_args.cmd == 'DISCONNECTED') {
					if (!pyscratch.disconnected) {
						for (k in pyscratch.cmds) {
							if (!k.startsWith('Stage-')) {
								// Non-stage objects "say" the error.
								pyscratch.cmds[k].push(cmd_args);
							} else {
								// Try to restart the session, in case the server was restarted.
								pyscratch.loaded = false;
							}
						}
						pyscratch.disconnected = true;
					}
				} else if (clone_id in pyscratch.cmds) {
					pyscratch.disconnected = false;
					pyscratch.cmds[clone_id].push(cmd_args);
				} else {
					console.log("ERROR: got command "+JSON.stringify(cmd_args)+" for unknown "+clone_id);
				}
			}
			pyscratch.concurrency_check--;
			delete pyscratch.fetching[data.name];
			if (pyscratch.disconnected) {
				new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
					console.log("Retrying server");
					return;
				});

			} else {
				return;
			}
		});
	}

	getCloneID({object_name, cur_id}) {
		var ret = this.fetchCloneID(object_name, cur_id, function(data, pyscratch) {
			pyscratch.vars[data.clone_id] = { 'clone_id' : data.clone_id };
			pyscratch.vars[data.clone_id].uuid = pyscratch.uuid;
			pyscratch.cmds[data.clone_id] = [];
			if (!(object_name in pyscratch.completed))
				pyscratch.completed[object_name] = []
			console.log('New object '+object_name+' got clone_id '+data.clone_id);
			return data.clone_id;
		});
		//console.log(ret);
		return ret;
	}

	sendEvent({event_name, event_arg, clone_id}) {
		return this.deliverEvent(event_name, event_arg, clone_id, function(data, pyscratch) {});
	}

	startEvent() {
		return this.deliverStart(function(data, pyscratch) {
			pyscratch.uuid = data.uuid;
			console.log('sent start event, UUID='+pyscratch.uuid);
			return;
		});
	}

	createVar({name, value}) {
		return this.deliverVar(name, value, function(data, pyscratch) {
			console.log('created var '+name+' = '+value);
			return;
		});
	}

	createColorVar({name, value}) {
		return this.deliverVar(name, value, function(data, pyscratch) {
			console.log('created color var '+name+' = '+value);
			return;
		});
	}

	scratchLog({l1, l2, l3}) {
		console.log(l1,l2,l3);
		return;
	}

	when_loaded() {
		if (this.loaded)
			return false;
		console.log('extension starting');
		this.loaded = true;
		return true;
	}

	getInfo() {
		return {
			id: 'pyscratch',
			name: 'Pyscratch',

			blocks: [
				{
					opcode: 'getCloneID',

					blockType: Scratch.BlockType.REPORTER,

					text: 'get new clone_id for object [object_name] current is [cur_id]',
					arguments: {
						object_name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						cur_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'getCommands',

					blockType: Scratch.BlockType.COMMAND,

					text: 'fetch commands for object [name]',
					arguments: {
						name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'getCommandArg',

					blockType: Scratch.BlockType.REPORTER,

					text: 'get command arg [arg_name] for clone_id [clone_id]',
					arguments: {
						arg_name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						clone_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'getNextCommand',

					blockType: Scratch.BlockType.BOOLEAN,

					text: 'get next command for clone_id [clone_id]',
					arguments: {
						clone_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'setVar',

					blockType: Scratch.BlockType.COMMAND,

					text: 'set var [name] to [value] for clone_id [clone_id]',
					arguments: {
						name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						value: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						clone_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'removeVar',

					blockType: Scratch.BlockType.COMMAND,

					text: 'remove var [name] for clone_id [clone_id]',
					arguments: {
						name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						clone_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'setUrl',

					blockType: Scratch.BlockType.COMMAND,

					text: 'set url to [u]',
					arguments: {
						u: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'sendEvent',

					blockType: Scratch.BlockType.COMMAND,

					text: 'send event [event_name] with arg [event_arg] for clone_id [clone_id]',
					arguments: {
						event_name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						event_arg: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						clone_id: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'startEvent',

					blockType: Scratch.BlockType.COMMAND,

					text: 'send start event',
					arguments: {}
				},
				{
					opcode: 'createColorVar',

					blockType: Scratch.BlockType.COMMAND,

					text: 'create python constant [name] for color [value]',
					arguments: {
						name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						value: {
								type: Scratch.ArgumentType.COLOR,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'createVar',

					blockType: Scratch.BlockType.COMMAND,

					text: 'create python constant [name] with value [value]',
					arguments: {
						name: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						value: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				},
				{
					opcode: 'when_loaded',

					blockType: Scratch.BlockType.HAT,

					text: 'Extension loaded',
					arguments: {}
				},
				{
					opcode: 'scratchLog',

					blockType: Scratch.BlockType.COMMAND,

					text: 'log [l1] [l2] [l3]',
					arguments: {
						l1: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						l2: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						},
						l3: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: ''
						}
					}
				}
			]
		}
	}
}

Scratch.extensions.register(new Pyscratch());

