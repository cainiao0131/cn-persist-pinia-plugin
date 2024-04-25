import { createCnPersistPiniaPlugin } from './plugin'

export {
  type CnPersistOptions,
  type CnStateConverter,
  type CnStateSerializer,
  type CnStateDeserializer,
  type CnDeserializePostHandler,
  type StorageLike,
} from './types'

export { createCnPersistPiniaPlugin }
export default createCnPersistPiniaPlugin()
