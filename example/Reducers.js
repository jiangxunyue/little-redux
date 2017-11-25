
let reducer1 = function (action, state = 1) {
    switch (action.type) {
        case 'add':
            return state + action.payload
    }
    return state;
}
let reducer2 = {
    reducer2_1: function (action, state = {name: 'world'}) {
        return state;
    },
    reducer2_2: 10,
    reducer2_3: function (action, state =  0) {
        switch (action.type) {
            case "change":
                return state + action.payload;
            default:
                return state;
        }
    },
    reducer2_4: {
        reducer2_4_1: function (action, state =  0) {
            switch (action.type) {
                case "minus":
                    return state - action.payload;
                default:
                    return state;
            }
        },
        reducer2_4_2: 10
    }
}

module.exports = {
    reducer1,
    reducer2
}