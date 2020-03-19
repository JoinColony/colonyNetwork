// Versions of colonyNetwork. TS automatically increments from 1
export enum ColonyVersions {
  GoerliGlider = 1, // glider-rc.1
  Glider,
  AuburnGlider,
  BurgundyGlider,
}

export interface ColonyClient {
  readonly version: ColonyVersions;
}
