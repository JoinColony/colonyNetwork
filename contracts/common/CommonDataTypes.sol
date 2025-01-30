// SPDX-License-Identifier: GPL-3.0-or-later
/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.8.28;

// prettier-ignore
interface CommonDataTypes {
  struct Skill {
    // total number of parent skills
    uint128 nParents;
    // total number of child skills
    uint128 nChildren;
    // array of `skill_id`s of parent skills starting from the 1st to `n`th, where `n` is an integer power of two larger than or equal to 1
    uint256[] parents;
    // array of `skill_id`s of all child skills
    uint256[] children;
    // `true` for a global skill reused across colonies or `false` for a skill mapped to a single colony's domain
    bool DEPRECATED_globalSkill;
    // `true` for a skill that is deprecated NB: deprecation is now stored locally on colonies
    bool DEPRECATED_deprecated;
  }
}
