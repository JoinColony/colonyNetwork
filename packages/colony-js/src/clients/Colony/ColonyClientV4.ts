import { IColony } from '../../../contracts/IColony/v4/IColony';
import { ColonyClient, ColonyVersions } from './ColonyClient';
import ColonyClientV3 from './ColonyClientV3';

class ColonyClientV4 extends ColonyClientV3 implements ColonyClient {
  version = ColonyVersions.BurgundyGlider;

  /* IDEAS */
  // contract: IColony;

  // constructor() {
  //   super();
  //   this.contract = new IColony();
  //   // Make `estimate` a class?
  //   this.estimate = {
  //     ...super.estimate,
  //     addDomain,
  //   };
  // }

  // // Other option
  // estimateAddDomainWithProofs()
  // // Instead of
  // estimate.addDomainWithProofs()

  // addDomainWithProofs(parentDomain: number) {
  //   const [_childSkillIndex, _childDomainId] = this.getDomainProofs(
  //     'addDomain',
  //   );
  //   return this.contract.addDomain(
  //     _childSkillIndex,
  //     _childSkillIndex,
  //     parentDomain,
  //   );
  // }
}

export default ColonyClientV4;

/* IDEAS */
// colonyClient.contract.getTask();
// colonyClient.addDomainWithProofs();

// if (
//   version === ColonyVersions.Glider ||
//   version === ColonyVersions.AuburnGlider ||
//   version === ColonyVersions.BurgundyGlider
// ) {
//   colonyClient.addDomain();
// }
