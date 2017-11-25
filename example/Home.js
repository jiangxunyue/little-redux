import React, {Component} from "react";
import {View, Text} from "react-native";
import {Store} from 'little-redux';
import * as Reducers from './Reducers';
const store = new Store(Reducers);

class Home extends Component {

    onPress1 = () => {
        this.store.dispatch((dispatch, store) => {
            dispatch({type: 'add', payload: 1});
        });
    };
    onPress2 = () => {
        this.store.dispatch({type: 'change', payload: 2});
    };
    onPress3 = () => {
        this.store.dispatch({type: 'minus', payload: 3})
    };
    render() {
        return (
            <View style={{alignSelf: 'center', alignItems: 'center'}}>
                <Text style={{color: 'black', fontSize: 20}} onPress={this.onPress1}>{'||| ' + this.store.data.count + ' |||'}</Text>
                <Text style={{color: 'black', fontSize: 20}} onPress={this.onPress2}>{'/// ' + this.store.data.count1 + ' ///'}</Text>
                <Text style={{color: 'black', fontSize: 20}} onPress={this.onPress3}>{'{{{ ' + this.store.data.$$reducer2$$reducer2_4$$reducer2_4_1 + ' }}}'}</Text>
            </View>
        )
    }
}
Home = store.bindClassToNodes({
    '/reducer1': ['count', (value) => {
        return value * 10
    }],
    '/reducer2/reducer2_3': 'count1',
    '/reducer2/reducer2_4/reducer2_4_1': (value) => {
        return value + '--kkk'
    }
})(Home);
// Home = store.bindClass('/reducer1', 'count3', (value) => {
//     return value*10
// })(Home);

export default Home;