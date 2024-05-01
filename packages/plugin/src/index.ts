import { createCnPersistPiniaPlugin } from './plugin';

export {
  type CnPersistFactoryOptions,
  type CnStateSerializer,
  type CnStateDeserializer,
  type CnDeserializePostHandler,
  type StorageLike,
} from './types';

export { createCnPersistPiniaPlugin };
export default createCnPersistPiniaPlugin();
