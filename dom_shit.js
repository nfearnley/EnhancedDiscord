const path = window.require('path');
const fs = window.require('fs');
const electron = window.require('electron');
const Module =  window.require('module').Module;
Module.globalPaths.push(path.resolve(electron.remote.app.getAppPath(), 'node_modules'));
const currentWindow = electron.remote.getCurrentWindow();
if (currentWindow.__preload) require(currentWindow.__preload);

//Get inject directory
if (!process.env.injDir) process.env.injDir = __dirname;

//set up global functions
let c = {
    log: function(msg, plugin) {
        if (plugin && plugin.name)
            console.log(`%c[EnhancedDiscord] %c[${plugin.name}]`, 'color: red;', `color: ${plugin.color}`, msg);
    	else console.log('%c[EnhancedDiscord]', 'color: red;', msg);
    },
    info: function(msg, plugin) {
        if (plugin && plugin.name)
            console.info(`%c[EnhancedDiscord] %c[${plugin.name}]`, 'color: red;', `color: ${plugin.color}`, msg);
    	else console.info('%c[EnhancedDiscord]', 'color: red;', msg);
    },
    warn: function(msg, plugin) {
        if (plugin && plugin.name)
            console.warn(`%c[EnhancedDiscord] %c[${plugin.name}]`, 'color: red;', `color: ${plugin.color}`, msg);
    	else console.warn('%c[EnhancedDiscord]', 'color: red;', msg);
    },
    error: function(msg, plugin) {
        if (plugin && plugin.name)
            console.error(`%c[EnhancedDiscord] %c[${plugin.name}]`, 'color: red;', `color: ${plugin.color}`, msg);
    	else console.error('%c[EnhancedDiscord]', 'color: red;', msg);
    },
    sleep: function(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}
// config util
window.ED = { plugins: {}, version: '2.4.1' };
Object.defineProperty(window.ED, 'config', {
    get: function() {
        let conf;
        try{
            conf = require('./config.json');
        } catch (err) {
            if(err.code !== 'MODULE_NOT_FOUND')
                c.error(err);
            conf = {};
        }
        return conf;
    },
    set: function(newSets = {}) {
        let confPath;
        let bDelCache;
        try{
            confPath = require.resolve('./config.json');
            bDelCache = true;
        } catch (err) {
            if(err.code !== 'MODULE_NOT_FOUND')
                c.error(err);
            confPath = path.join(process.env.injDir, 'config.json');
            bDelCache = false;
        }

        try {
            fs.writeFileSync(confPath, JSON.stringify(newSets));
            if(bDelCache)
                delete require.cache[confPath];
        } catch(err) {
            c.error(err);
        }
        return this.config;
    }
});

function loadPlugin(plugin) {
    try {
    	if (plugin.preload)
    		console.log(`%c[EnhancedDiscord] %c[PRELOAD] %cLoading plugin %c${plugin.name}`, 'color: red;', 'color: yellow;', '', `color: ${plugin.color}`, `by ${plugin.author}...`);
        else console.log(`%c[EnhancedDiscord] %cLoading plugin %c${plugin.name}`, 'color: red;', '', `color: ${plugin.color}`, `by ${plugin.author}...`);
        plugin.load();
    } catch(err) {
        c.error(`Failed to load:\n${err.stack}`, plugin);
    }
}

window.ED.localStorage = window.localStorage;

process.once("loaded", async () => {
    c.log(`v${window.ED.version} is running.`);
	while (!window.webpackJsonp)
		await c.sleep(1000); // wait until this is loaded in order to use it for modules

    window.ED.webSocket = window._ws;

	/* Add helper functions that make plugins easy to create */
	window.req = webpackJsonp.push([[], {
	    '__extra_id__': (module, exports, req) => module.exports = req
	}, [['__extra_id__']]]);
	delete req.m['__extra_id__'];
	delete req.c['__extra_id__'];

    window.findModule = EDApi.findModule;
    window.findModules = EDApi.findAllModules;
    window.findRawModule = EDApi.findRawModule;
    window.monkeyPatch = EDApi.monkeyPatch;

    while (!window.findModule('startTyping', true) || !window.findModule('track', true) || !window.findModule('collectWindowErrors', true))
        await c.sleep(500); // wait until essential modules are loaded

    if (window.ED.config.silentTyping) {
        window.monkeyPatch(window.findModule('startTyping'), 'startTyping', () => {});
    }

    if (window.ED.config.antiTrack !== false) {
        window.monkeyPatch(window.findModule('track'), 'track', () => {});
        const errReports = window.findModule('collectWindowErrors');
        errReports.collectWindowErrors = false;
        window.monkeyPatch(errReports, 'report', () => {});
    }

    while (Object.keys(window.req.c).length < 5000)
        await c.sleep(1000); // wait until most modules are loaded for plugins

    if (window.ED.config.bdPlugins)
        await require('./bd_shit').setup(currentWindow);

    c.log(`Loading and validating plugins...`);
    let pluginFiles = fs.readdirSync(path.join(process.env.injDir, 'plugins'));
    let plugins = {};
    for (let i in pluginFiles) {
        if (!pluginFiles[i].endsWith('.js')) continue;
        if (!window.ED.config.bdPlugins && pluginFiles[i].endsWith(".plugin.js")) continue;
        let p, pName = pluginFiles[i].replace(/\.js$/, '');
        try {
            p = require(path.join(process.env.injDir, 'plugins', pName));
            if (typeof p.name !== 'string' || typeof p.load !== 'function') {
                throw new Error('Plugin must have a name and load() function.');
            }
            plugins[pName] = Object.assign(p, {id: pName});
        }
        catch (err) {
            c.warn(`Failed to load ${pluginFiles[i]}: ${err}\n${err.stack}`, p);
        }
    }

    for (let id in plugins) {
        if (!plugins[id] || !plugins[id].name || typeof plugins[id].load !== 'function') {
            c.info(`Skipping invalid plugin: ${id}`); plugins[id] = null; continue;
        }
        plugins[id].settings; // this will set default settings in config if necessary
        if (window.ED.config[id] && window.ED.config[id].enabled == false) continue;
        if (!plugins[id].preload) continue;
        loadPlugin(plugins[id]);
    }
    window.ED.plugins = plugins;

    c.log(`Waiting for modules...`);
    while (!window.webpackJsonp || window.webpackJsonp.length < 25)
        await c.sleep(1000); // wait until this is loaded in order to use it for modules

    c.log(`Loading plugins...`);
    for (let id in plugins) {
        if (window.ED.config[id] && window.ED.config[id].enabled == false) continue;
        if (plugins[id].preload) continue;
        loadPlugin(plugins[id]);
    }

    const ht = window.findModule('hideToken'), cw = findModule('consoleWarning');
    // prevent client from removing token from localstorage when dev tools is opened, or reverting your token if you change it
    monkeyPatch(ht, 'hideToken', () => {});
    window.fixedShowToken = () => {
        // Only allow this to add a token, not replace it. This allows for changing of the token in dev tools.
        if (!window.ED.localStorage || window.ED.localStorage.getItem("token")) return;
        return window.ED.localStorage.setItem("token", '"'+ht.getToken()+'"');
    };
    monkeyPatch(ht, 'showToken', fixedShowToken);
    if (!window.ED.localStorage.getItem("token") && ht.getToken())
        fixedShowToken(); // prevent you from being logged out for no reason

    // change the console warning to be more fun
    monkeyPatch(cw, 'consoleWarning', () => {
        console.log("%cHold Up!", "color: #FF5200; -webkit-text-stroke: 2px black; font-size: 72px; font-weight: bold;");
        console.log("%cIf you're reading this, you're probably smarter than most Discord developers.", "font-size: 16px;");
        console.log("%cPasting anything in here could actually improve the Discord client.", "font-size: 18px; font-weight: bold; color: red;");
        console.log("%cUnless you understand exactly what you're doing, keep this window open to browse our bad code.", "font-size: 16px;");
        console.log("%cIf you don't understand exactly what you're doing, you should come work with us: https://discordapp.com/jobs", "font-size: 16px;");
    });
})



/* BD/ED joint api */
window.EDApi = window.BdApi = class EDApi {
    static get React() { return this.findModuleByProps('createElement'); }
    static get ReactDOM() { return this.findModuleByProps('findDOMNode'); }

    static escapeID(id) {
        return id.replace(/^[^a-z]+|[^\w-]+/gi, "");
    }

    static injectCSS(id, css) {
        const style = document.createElement("style");
		style.id = this.escapeID(id);
		style.innerHTML = css;
		document.head.append(style);
    }

    static clearCSS(id) {
		const element = document.getElementById(this.escapeID(id));
		if (element) element.remove();
    }

    static linkJS(id, url) {
        return new Promise(resolve => {
			const script = document.createElement("script");
			script.id = this.escapeID(id);
			script.src = url;
			script.type = "text/javascript";
			script.onload = resolve;
			document.head.append(script);
		});
    }

    static unlinkJS(id) {
        const element = document.getElementById(this.escapeID(id));
		if (element) element.remove();
    }

    static getPlugin(name) {
        const plugin = Object.values(window.ED.plugins).find(p => p.name == name);
        if (!plugin) return null;
        return plugin.bdplugin ? plugin.bdplugin : plugin;
    }

    static alert(title, body) {
        const ModalStack = EDApi.findModuleByProps("push", "update", "pop", "popWithKey");
        const AlertModal = EDApi.findModule(m => m.prototype && m.prototype.handleCancel && m.prototype.handleSubmit && m.prototype.handleMinorConfirm);
        if (!ModalStack || !AlertModal) return window.alert(body);
        ModalStack.push(function(props) {
            return EDApi.React.createElement(AlertModal, Object.assign({title, body}, props));
        });
    }

    static loadData(pluginName, key) {
        if (!window.ED.config[pluginName]) window.ED.config[pluginName] = {};
        return window.ED.config[pluginName][key];
    }

    static saveData(pluginName, key, data) {
        if (!window.ED.config[pluginName]) window.ED.config[pluginName] = {};
        window.ED.config[pluginName][key] = data;
        window.ED.config = window.ED.config;
    }

    static getData(pluginName, key) {
        return EDApi.loadData(pluginName, key);
    }

    static setData(pluginName, key, data) {
        EDApi.saveData(pluginName, key, data);
    }

    static getInternalInstance(node) {
        if (!(node instanceof window.jQuery) && !(node instanceof Element)) return undefined;
        if (node instanceof window.jQuery) node = node[0];
        return node[Object.keys(node).find(k => k.startsWith("__reactInternalInstance"))];
    }

    static showToast(content, options = {}) {
        if (!document.querySelector(".toasts")) {
            let toastWrapper = document.createElement("div");
            toastWrapper.classList.add("toasts");
            let boundingElement = document.querySelector(".chat-3bRxxu form, #friends, .noChannel-Z1DQK7, .activityFeed-28jde9");
            toastWrapper.style.setProperty("left", boundingElement ? boundingElement.getBoundingClientRect().left + "px" : "0px");
            toastWrapper.style.setProperty("width", boundingElement ? boundingElement.offsetWidth + "px" : "100%");
            toastWrapper.style.setProperty("bottom", (document.querySelector(".chat-3bRxxu form") ? document.querySelector(".chat-3bRxxu form").offsetHeight : 80) + "px");
            document.querySelector("." + findModule('app').app).appendChild(toastWrapper);
        }
        const {type = "", icon = true, timeout = 3000} = options;
        let toastElem = document.createElement("div");
        toastElem.classList.add("toast");
        if (type) toastElem.classList.add("toast-" + type);
        if (type && icon) toastElem.classList.add("icon");
        toastElem.innerText = content;
        document.querySelector(".toasts").appendChild(toastElem);
        setTimeout(() => {
            toastElem.classList.add("closing");
            setTimeout(() => {
                toastElem.remove();
                if (!document.querySelectorAll(".toasts .toast").length) document.querySelector(".toasts").remove();
            }, 300);
        }, timeout);
    }

    static findModule(filter, silent = true) {
    	let moduleName = typeof filter === 'string' ? filter : null;
        for (let i in req.c) {
            if (req.c.hasOwnProperty(i)) {
                let m = req.c[i].exports;
                if (m && m.__esModule && m.default && (moduleName ? m.default[moduleName] : filter(m.default))) return m.default;
                if (m && (moduleName ? m[moduleName] : filter(m)))	return m;
            }
        }
        if (!silent) c.warn(`Could not find module ${module}.`, {name: 'Modules', color: 'black'})
        return null;
    }

    static findRawModule(filter, silent = true) {
    	let moduleName = typeof filter === 'string' ? filter : null;
        for (let i in req.c) {
            if (req.c.hasOwnProperty(i)) {
                let m = req.c[i].exports;
                if (m && m.__esModule && m.default && (moduleName ? m.default[moduleName] : filter(m.default))) return req.c[i];
                if (m && (moduleName ? m[moduleName] : filter(m)))	return req.c[i];
            }
        }
        if (!silent) c.warn(`Could not find module ${module}.`, {name: 'Modules', color: 'black'})
        return null;
    }

    static findAllModules(filter) {
    	let moduleName = typeof filter === 'string' ? filter : null;
        const modules = [];
        for (let i in req.c) {
            if (req.c.hasOwnProperty(i)) {
                let m = req.c[i].exports;
                if (m && m.__esModule && m.default && (moduleName ? m.default[moduleName] : filter(m.default))) modules.push(m.default);
                else if (m && (moduleName ? m[moduleName] : filter(m))) modules.push(m);
            }
        }
        return modules;
    }

    static findModuleByProps(...props) {
        return EDApi.findModule(module => props.every(prop => module[prop] !== undefined));
    }

    static findModuleByDisplayName(name) {
        return EDApi.findModule(module => module.displayName === name);
    }

    static monkeyPatch(what, methodName, options) {
        if (typeof options === 'function') {
    	    const newOptions = {instead: options, silent: true};
    	    options = newOptions;
        }
        const {before, after, instead, once = false, silent = false, force = false} = options;
        const displayName = options.displayName || what.displayName || what.name || what.constructor.displayName || what.constructor.name;
        if (!silent) console.log(`%c[EnhancedDiscord] %c[Modules]`, 'color: red;', `color: black;`, `Patched ${methodName} in module ${displayName || '<unknown>'}:`, what); // eslint-disable-line no-console
        if (!what[methodName]) {
            if (force) what[methodName] = function() {};
            else return console.warn(`%c[EnhancedDiscord] %c[Modules]`, 'color: red;', `color: black;`, `Method ${methodName} doesn't exist in module ${displayName || '<unknown>'}`, what); // eslint-disable-line no-console
        }
        const origMethod = what[methodName];
        const cancel = () => {
            if (!silent) console.log(`%c[EnhancedDiscord] %c[Modules]`, 'color: red;', `color: black;`, `Unpatched ${methodName} in module ${displayName || '<unknown>'}:`, what); // eslint-disable-line no-console
            what[methodName] = origMethod;
        };
        what[methodName] = function() {
            const data = {
                thisObject: this,
                methodArguments: arguments,
                cancelPatch: cancel,
                originalMethod: origMethod,
                callOriginalMethod: () => data.returnValue = data.originalMethod.apply(data.thisObject, data.methodArguments)
            };
            if (instead) {
                const tempRet = EDApi.suppressErrors(instead, "`instead` callback of " + what[methodName].displayName)(data);
                if (tempRet !== undefined) data.returnValue = tempRet;
            }
            else {
                if (before) EDApi.suppressErrors(before, "`before` callback of " + what[methodName].displayName)(data);
                data.callOriginalMethod();
                if (after) EDApi.suppressErrors(after, "`after` callback of " + what[methodName].displayName)(data);
            }
            if (once) cancel();
            return data.returnValue;
        };
        what[methodName].__monkeyPatched = true;
        what[methodName].displayName = "patched " + (what[methodName].displayName || methodName);
        what[methodName].unpatch = cancel;
        return cancel;
    }

    static testJSON(data) {
        try {
            JSON.parse(data);
            return true;
        }
        catch (err) {
            return false;
        }
    }

    static suppressErrors(method, description) {
        return (...params) => {
            try { return method(...params);	}
            catch (e) { console.error("Error occurred in " + description, e); }
        };
    }

    static formatString(string, values) {
        for (let val in values) {
            string = string.replace(new RegExp(`\\{\\{${val}\\}\\}`, 'g'), values[val]);
        }
        return string;
    }
	
	static isPluginEnabled(name) {
		const plugins = Object.values(window.ED.plugins);
		const plugin = plugins.find(p => p.id == name || p.name == name);
		if (!plugin) return false;
		return !(plugin.settings.enabled === false);
	}

	static isThemeEnabled(name) {
		return false;
	}

	static isSettingEnabled(id) {
		return window.ED.config[id];
	}
};
