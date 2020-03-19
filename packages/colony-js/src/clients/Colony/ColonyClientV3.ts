import { IColony } from '../../../contracts/IColony/v3/IColony';
import { ColonyClient, ColonyVersions } from './ColonyClient';
import ColonyClientV2 from './ColonyClientV2';

class ColonyClientV3 extends ColonyClientV2 implements ColonyClient {
  version = ColonyVersions.AuburnGlider;
}

export default ColonyClientV3;
