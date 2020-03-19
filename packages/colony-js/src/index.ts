import { ColonyVersions } from './clients/Colony/ColonyClient';

import ColonyClientV1 from './clients/Colony/ColonyClientV1';
import ColonyClientV2 from './clients/Colony/ColonyClientV2';
import ColonyClientV3 from './clients/Colony/ColonyClientV3';
import ColonyClientV4 from './clients/Colony/ColonyClientV4';

export { ColonyVersions } from './clients/Colony/ColonyClient';

export const ColonyClients = {
  [ColonyVersions.GoerliGlider]: ColonyClientV1,
  [ColonyVersions.Glider]: ColonyClientV2,
  [ColonyVersions.AuburnGlider]: ColonyClientV3,
  [ColonyVersions.BurgundyGlider]: ColonyClientV4,
};
