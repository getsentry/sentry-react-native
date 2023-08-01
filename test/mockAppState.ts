import type { AppState, AppStateEvent, AppStateStatus, NativeEventSubscription } from 'react-native';
import EventEmitter from 'react-native/Libraries/vendor/emitter/EventEmitter';

export class MockAppState implements AppState {
  private _eventEmitter: EventEmitter = new EventEmitter();

  constructor(public currentState: AppStateStatus = 'active', public isAvailable: boolean = true) {}

  public addEventListener(type: AppStateEvent, listener: (state: AppStateStatus) => void): NativeEventSubscription {
    return this._eventEmitter.addListener(type, listener);
  }

  public changeState(to: AppStateStatus): void {
    this.currentState = to;
    this._eventEmitter.emit('change', to);
  }
}
