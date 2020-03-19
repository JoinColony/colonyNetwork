import { IColony } from '../../../contracts/IColony/v2/IColony';
import { ColonyClient, ColonyVersions } from './ColonyClient';
import ColonyClientV1 from './ColonyClientV1';

class ColonyClientV2 extends ColonyClientV1 implements ColonyClient {
  version = ColonyVersions.Glider;

  getDomainProofs() {
    // FIXME Implement
    return null;
  }
}

export default ColonyClientV2;
