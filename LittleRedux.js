import React, {Component} from 'react';
import invariant from 'fbjs/lib/invariant';

const REACT_ELEMENT_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("react.element") || 0xeac7;
const SUBSCRIBER_SELECTOR_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("subscriber.selector") || 'subscriber.selector';
const STORE_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("store.type") || 'store.type';
const STORE_NODE_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("store.node.type") || 'store.node.type';

class Provider extends Component {
    static childContextTypes = {
        store: React.PropTypes.object.isRequired,
    };
    getChildContext = () => {
        return {
            store: this.props.store,
        }
    };

    render() {
        return React.Children.only(this.props.children)
    }
}

class Store {
    $$typeof = STORE_TYPE;
    _rootNode = null;
    _nodesMap = new Map();

    constructor(reducers) {
        this._rootNode = new Node('/', reducers, null, this);
    }

    get state() {
        return this._rootNode.state;
    }

    setNewNode = (path, node) => {
        this._nodesMap.set(path, node)
    };

    dispatch = (action) => {
        invariant(action, 'action must be a function or object');
        this._rootNode.dispatch(action);
    };

    // 通过Store获取节点
    getNodeForPath = (path: string) => {
        // let node = this._rootNode.getNodeForPath(path);
        let node = this._nodesMap.get(path)
        invariant(node, `Can't find the node with path: ${path}`);
        return node;
    };

    setSubscriberForNode = (nodePath, mapKey, selector) => {
        if (!nodePath) return;
        let node: Node = this.getNodeForPath(nodePath);
        if (!node) return;
        return (subscriber) => node.setSubscriber(subscriber, mapKey, selector);
    };

    bindClass = (nodePath, mapKey, selector) => {
        if (!nodePath) return;
        let node: Node = this.getNodeForPath(nodePath);
        if (!node) return;
        return (subscriberClass) => {
            let newSubscriberClass = function (...args) {
                let subscriber = new subscriberClass(...args);
                node.setSubscriber(subscriber, mapKey, selector);
                return subscriber;
            };
            return newSubscriberClass;
        };
    };
    /**
     * 绑定多个node
     * @param subscriberClass
     * @param pathKeyMap
     *
     * 第一种情况： pathKeyMap instanceof Object
     * {path : [mapKey, selector]}
     * {path : mapKey/selector]}
     * 第二种情况： pathKeyMap mapKey selector
     * let that = this;
     let newSubscriberClass = function (...args) {
         let subscriber = new subscriberClass(...args);
         node.setSubscriber(subscriber, mapKey);
         return subscriber;
     };
     return newSubscriberClass;
     */
    bindClassToNodes = (pathKeyMap, mapKey, selector) => {
        if (!pathKeyMap) {
            return;
        }
        return (subscriberClass) => {
            let bindsArray = [];
            if (pathKeyMap instanceof Object) {
                for (let path in pathKeyMap) {
                    if (!pathKeyMap.hasOwnProperty(path)) continue;
                    let key = pathKeyMap[path];
                    let node: Node = this.getNodeForPath(path);
                    // invariant(node, 'node for path: ' + path + ' is undefined');
                    bindsArray.push(function (subscriber) {
                        if (Array.isArray(key)) {
                            invariant(key.length > 1 && typeof key[0] === 'string' && typeof key[1] === 'function', "When adopt the {path : [mapKey, selector]} mode,"
                                + " you must provide a mapKey with string type, and a selector with function type");
                            node.setSubscriber(subscriber, key[0], key[1]);
                        } else {
                            invariant(typeof key === 'string' || typeof key === 'function', "When adopt the {path : mapKey/selector} mode,"
                                + " you must provide a mapKey with string type or a selector with function type");
                            if (typeof key === 'string') {
                                node.setSubscriber(subscriber, key);
                            } else {
                                node.setSubscriber(subscriber, null, key);
                            }
                        }
                    });
                }
            } else if (typeof pathKeyMap === "string") {
                let node: Node = this.getNodeForPath(pathKeyMap);
                bindsArray.push(function (subscriber) {
                    node.setSubscriber(subscriber, mapKey, selector);
                });
            }

            let newSubscriberClass = function (...args) {
                let subscriber = new subscriberClass(...args);
                for (let setSubscriber of bindsArray) {
                    setSubscriber(subscriber);
                }
                return subscriber;
            };
            return newSubscriberClass;
        }
    };

    logStoreMap = () => {
        console.warn(JSON.stringify(this._rootNode.logStoreMap()))
    }
}

class Node {

    $$typeof = STORE_NODE_TYPE;
    // 订阅者是改变后需要通知去更新的组件， 可以有多个订阅者；
    _subscribers = new Map();
    // 自身更新后也要通知父节点去更新, 只能有一个父节点
    _fatherNode = null;

    _key = null;

    _path = null;

    _reducer = null;

    _subStore = null;

    _value = null;

    _globalStore = null;

    constructor(key, reducer, fatherNode, store) {
        this.key = key;
        this._fatherNode = fatherNode || null;
        this.path = key;
        this._globalStore = store;
        store.setNewNode(this.path, this);

        if (reducer instanceof Function) {
            this._reducer = reducer;
            this._value = reducer({});
        } else if (reducer instanceof Object) {
            this._value = {};
            this.setReducers(reducer, this);
        } else {
            // 普通值，不会变化；
            this._value = reducer;
        }
        this.updateFather();
    }

    setReducers = (reducers, fatherNode) => {
        this._subStore = new Map();
        for (let key in reducers) {
            let reducer = reducers[key];
            let subNode = new Node(key, reducer, fatherNode, this._globalStore);
            this._subStore.set(key, subNode);
        }
    };
    /**
     * 处理action，本节点处理，或，交给 子store去处理
     * @param action
     */
    dispatch = (action) => {
        action = action || {};
        if (this._reducer) {
            this.value = this._reducer(action, this.value);
        }

        if (this._subStore) {
            for (let [key, node] of this._subStore) {
                node.dispatch(action);
            }
        }
    };

    // 通过Store获取节点
    getNodeForPath = (path: string) => {
        if (!path) return null;
        path = path.replace(/\/{2,}/g, '/');
        if (path === this.path) return this;
        if (!this._subStore) return null;
        let subPath = path.substring(this.path.length);
        let keys = subPath.split('/');
        let subKey = keys[0] || keys[1];
        if (this._subStore.has(subKey)) return this._subStore.get(subKey).getNodeForPath(path);
    };

    get fatherNode() {
        return this._fatherNode;
    }

    get store() {
        return this._subStore;
    }

    set key(key) {
        this._key = key;
    }

    get key() {
        return this._key;
    }

    /**
     * path值记录从根节点到本节点的完整路径；用于寻找节点，不推荐用它去子节点中取值；
     * @param key
     */
    set path(key) {
        if (!this.fatherNode) {
            this._path = key;
        } else {
            this._path = `${this.fatherNode.path}/${key}`.replace(/\/{2,}/g, '/');
        }
    }

    get path() {
        return this._path;
    }
    /**
     * 添加订阅者，订阅者必须为react component 对象
     * @param subscriber
     * @param mapKey
     */
    setSubscriber = (subscriber, mapKey, selector) => {
        if (!subscriber || !(subscriber instanceof Component)) {
            throw new Error('订阅者必须为Component的实例');
        }
        let that = this;
        mapKey = mapKey || this.path.replace(/\//g, '$$$$');

        function bindStore(subscriber) {
            let oldUnmount = subscriber.componentWillUnmount;
            subscriber.componentWillUnmount = (function () {
                that._subscribers.delete(subscriber);
                oldUnmount && oldUnmount.call(subscriber);
            }).bind(subscriber);

            subscriber.store = subscriber.store || {};
            subscriber.store.data = subscriber.store.data || {};

            subscriber.store.data[mapKey] = typeof selector === 'function' ? selector(that.value) : that.value;
            // 给订阅者绑定局部的dispatch；
            let dispatchChain = that.dispatchChain;
            let rootDispatch = that.dispatchChain[0];
            let minDispatch = subscriber.store['minDispatch'];
            if (!minDispatch) {
                let dispatchTree = new TreeNode(null, null, 0);
                dispatchTree.setSons(dispatchChain);
                minDispatch = function (action) {
                    // TODO: minDispatch
                    invariant(action, 'action must be a function or object');
                    if (action instanceof Function) {
                        action(that.dispatch, that);
                    } else {
                        let subDispatch = arguments.callee.dispatchTree.minFather;
                        if (subDispatch) {
                            subDispatch(action);
                        }
                    }
                };
                let prevProto = Object.getPrototypeOf(minDispatch);
                let currentProto = {dispatchTree};
                Object.setPrototypeOf(currentProto, prevProto);
                Object.setPrototypeOf(minDispatch, currentProto);
                subscriber.store['minDispatch'] = minDispatch;
            } else {
                subscriber.store['minDispatch'].dispatchTree.setSons(dispatchChain);
            }

            // 绑定全局dispatch；
            subscriber.store['dispatch'] = function(action) {
                if (action instanceof Function) {
                    action(rootDispatch, that._globalStore);
                } else {
                    rootDispatch(action);
                }
            }
        }

        this._subscribers.set(subscriber, selector ? {
            $$type: SUBSCRIBER_SELECTOR_TYPE,
            mapKey: mapKey,
            selector
        } : mapKey);

        bindStore(subscriber);
    };

    /**
     * 作为叶子节点，更新值
     * @param value
     */
    set value(value) {
        //这里拿到确定的值，新的value
        if (value === this._value) return;
        this._value = value;
        this.updateFather();
        this.updateSubscribers();
    }

    get value() {
        return this._value
    }

    get state() {
        return this._value
    }

    /**
     * 被子节点的更新引发的更新；
     * @param key
     * @param value
     */
    updatePartValue = (key, value) => {
        if (this._value[key] === value) return;
        //这里拿到确定的值，新的value
        this._value = {...(this._value || {}), [key]: value};
        this.updateFather();
        this.updateSubscribers();
    };

    updateFather = () => {
        if (this.fatherNode && this.fatherNode.$$typeof === STORE_NODE_TYPE) {
            this.fatherNode.updatePartValue(this.key, this.value);
        }
    };

    updateSubscribers = () => {
        for (let [subscribe, mapKey] of this._subscribers) {
            this.updateSubscriber(subscribe, mapKey);
        }
    };
    updateSubscriber = (subscribe, mapKey) => {
        if (!subscribe) return;
        if (typeof mapKey === 'object' && mapKey['$$type'] === SUBSCRIBER_SELECTOR_TYPE) {
            let realMapKey = mapKey['mapKey'];
            let selector = mapKey['selector'];
            subscribe.store.data[realMapKey] = selector ? selector(this.value) : this.value;
        } else {
            subscribe.store.data[mapKey] = this.value;
        }

        subscribe.forceUpdate();
    };

    logStoreMap() {
        if (this._subStore) {
            let map = {};
            for (let key in this.value) {
                let subNode = this._subStore.get(key);
                if (subNode) {
                    map[key] = subNode.logStoreMap();
                } else {
                    map[key] = this.value[key];
                }
            }
            return map;
        } else {
            return this.path;
        }
    };

    get rootDispatch() {
        if (this.fatherNode) {
            return this.fatherNode.rootDispatch
        } else {
            return this.dispatch
        }
    }


    get dispatchChain() {
        if (this.fatherNode) {
            return [...this.fatherNode.dispatchChain, this.dispatch]
        } else {
            return [this._globalStore.dispatch]
        }
    }
}


class TreeNode {
    sonNodes = null;
    fatherNode = null;
    value = null;
    depth = 0;

    constructor(fatherNode, value, depth) {
        this.fatherNode = fatherNode;
        this.value = value;
        this.depth = depth;
    }

    setSons = (sons) => {
        this.sonNodes = this.sonNodes || new Map();
        let sonValue = sons.shift();
        let sonNode = this.sonNodes.get(sonValue);
        if (!sonNode) {
            sonNode = new TreeNode(this, sonValue, this.depth + 1);
            this.sonNodes.set(sonValue, sonNode);
        }

        if (sons.length > 0) {
            sonNode.setSons(sons);
        }
    };
    hasMultiSon = () => {
        if (!this.sonNodes) return false;
        return this.sonNodes.size > 1;
    };

    get minFather() {
        if (this.sonNodes && this.sonNodes.size > 0) {
            if (this.sonNodes.size > 1) {
                return this.value;
            } else {
                return [...this.sonNodes.values()][0].minFather;
            }
        } else {
            return this.value;
        }
    };

    logTree() {
        let selfMap = '';
        if (this.sonNodes) {
            selfMap = '{\n'
            for (let [value, node] of this.sonNodes) {
                selfMap += '    '.repeat(this.depth + 1) + value + ':' + node.logTree() + '\n'
            }
            selfMap += '    '.repeat(this.depth + 1) + '}'
        } else {
            selfMap = this.value;
        }
        return selfMap;
    }
}

module.exports = {
    Store, Provider
};