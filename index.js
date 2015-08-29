module.exports = function() {
    var fs = require('fs');
    var path_module = require('path');
    var debugFactory = require('debug');
    var debug = debugFactory('DIBuilder');
    var debugModule = function(msg){
        currentStack = currentStack || [];
        debug(repeat('>', currentStack.length * 3) + msg);
    };
    var debugError = function(msg){
        console.log('Error: ' + msg);
    };

    function repeat(pattern, count) {
        if (count < 1) return '';
        var result = '';
        while (count > 1) {
            if (count & 1) result += pattern;
            count >>= 1, pattern += pattern;
        }
        return result + pattern;
    }

    //definition
    var builder = {};
    builder.build = build;
    builder.loadModules = loadModules;
    builder.addModule = addModule;
    builder.addInstance = addInstance;
    return builder;
    
    //implementation
    var _instances = {};
    var _modules = {};
    function build(callback){
        try{        
            console.log('Building modules... ');
            var buildSuccess = _injectDependencies(_modules);
            if(!buildSuccess){
                console.log('Could not build dependencies.');
            } else {
                console.log('Resolved all dependencies with success!');
                if(typeof callback === 'function'){
                    callback();
                }
            }
        }catch(ex){
            debugError(ex.message);
        }
    }
    
    function loadModules(path) {
        try{
            var stat = fs.lstatSync(path);
            var isDirectory = stat.isDirectory();
            if (isDirectory) {
                var files = fs.readdirSync(path);
                var f, l = files.length;
                for (var i = 0; i < l; i++) {
                    f = path_module.join(path, files[i]);
                    loadModules(f);
                }
            } else {
                debug('loading module ' + path);
                require(path)(builder);
            }
        }catch(ex){
            debugError(ex.message);   
        }
    }
    
    function addInstance(name, instance){
        try{
            _instances = _instances || {};
            //validations        
            if(typeof _instances[name] !== "undefined")
            {
                debugModule("instance already defined for: " + name);
                return;
            }

            debugModule("instance of " + name + ' added');   
            _instances[name] = instance;
        }catch(ex){
            debugError(ex.message);  
        }
    }
    
    function addModule(constructor){
        try{
            _modules = _modules || {};
            var moduleName = constructor.name;
            
            //validations
            if(typeof constructor !== 'function'){
                debug('module should be a function'); 
                return;
            }

            if(typeof moduleName !== 'string'){
                debug('could not resolve module name'); 
                return;
            }

            if(typeof _modules[moduleName] !== 'undefined'){
                debug('module already defined for: ' + constructor.name); 
                return;
            }

            debugModule('module ' + moduleName + ' added');                    
            _modules[moduleName] = constructor;
        }catch(ex){
            debugError(ex.message);   
        }
    }
    
    var currentStack = [];
    function _injectDependencies(modules){
        try{
            currentStack = [];
            for(var moduleName in modules) {
                debugModule('Injecting into ' + moduleName);
                _injectDependenciesSingleModuleAndReturnInstance(moduleName);
            }
            return true;
        }catch(ex){
            debugError(ex.message);  
            return false;
        }
    }
    
    function _injectDependenciesSingleModuleAndReturnInstance(moduleName){ 
        if(currentStack.indexOf(moduleName) > -1){
            currentStack.push(moduleName);
            throw new Error('circular dependency found in: ' + currentStack.join(' > '));
        }    
        if(typeof _instances[moduleName] !== 'undefined'){
            debugModule('already found instance of ' + moduleName);
            return _instances[moduleName];
        } else {
            currentStack.push(moduleName);
            debugModule('building module: ' + moduleName);      
            var _module = _modules[moduleName];
            var dependencies = _getParameterNames(_module);
            debugModule('module dependencies: ' + dependencies.join());

            var dependenciesInstances = [];
            var hasDependencies = false;
            if(dependencies.length > 0 && dependencies[0] !== ''){
                hasDependencies = true;
            } else {
                debugModule('does not have dependency');
            }
            if(hasDependencies){
                for(var i = 0, len = dependencies.length; i < len; i++){
                    var dependencyName = dependencies[i];
                    var dependencyInstance = _instances[dependencyName];
                    if(typeof dependencyInstance === 'undefined'){
                        var dependencyModule = _modules[dependencyName];
                        if(typeof dependencyModule === "function"){
                            debugModule('building dependency module')
                            dependencyInstance = _injectDependenciesSingleModuleAndReturnInstance(dependencyName);
                        }

                        if(typeof dependencyInstance === 'undefined'){
                            throw new Error(dependencyName + ' not found or returning undefined!');
                        } else {
                            debugModule(dependencyName + ' found. Type: ' + typeof dependencyInstance);
                            dependenciesInstances.push(dependencyInstance);
                        }
                    } else {
                        debugModule(dependencyName + ' found. Type: ' + typeof dependencyInstance);
                        dependenciesInstances.push(dependencyInstance);
                    }
                }
            }
            if(!hasDependencies || dependenciesInstances.length === dependencies.length){
                var indexInStack = currentStack.indexOf(moduleName);
                try{
                    var _newInstance = _module.apply(this, dependenciesInstances);
                }catch(ex){
                    throw new Error('error inside module "' + moduleName + '" constructor: ' + ex.message);
                }
                addInstance(moduleName, _newInstance);
                if (indexInStack > -1) {
                    currentStack.splice(indexInStack, 1);
                }
                return _newInstance;
            } else {
                throw new Error('could not resolve dependencies for ' + moduleName);
            }
        }
    }
    
    function _getParameterNames(func){
        return func.toString()
          .replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s))/mg,'')
          .match(/^function\s*[^\(]*\(\s*([^\)]*)\)/m)[1]
          .split(/,/);   
    }
}();