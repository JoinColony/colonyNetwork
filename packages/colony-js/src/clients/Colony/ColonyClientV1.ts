import { IColony } from '../../../contracts/IColony/v1/IColony';
import { ColonyClient, ColonyVersions } from './ColonyClient';

class ColonyClientV1 implements ColonyClient {
  version = ColonyVersions.GoerliGlider;
}

export default ColonyClientV1;
