import { PlayerData } from "@/types/game"

export function parseFormation(formation: string): number[] {
  return formation.split("-").map(Number)
}

export function assignPositions(
  formation: string,
  lineup: string[],
  lineupNumbers: Array<number | null> = [],
  lineupCaptains: number[] = [],
  lineupGoals: number[] = [],
  lineupAssists: number[] = [],
  hasColoredCards = false,
  lineupYellowCards: number[] = [],
  lineupRedCards: number[] = [],
  lineupCards: number[] = [],
  lineupSubstitutions: number[] = []
): PlayerData[] {
  const formationArray = formation.split('-').map(Number);
  const positions: string[] = [];

  // Handle different formations
    if (formationArray.length === 3) {
        positions.push("GK"); // Goalkeeper
        
        // Example for 4-3-3
        if (formation === "4-3-3") {
            positions.push("RB", "CB", "CB", "LB");
            positions.push("CM", "CM", "CM");
            positions.push("RW", "ST", "LW");
        }
        // Example for 4-4-2
        else if (formation === "4-4-2") {
            positions.push("RB", "CB", "CB", "LB");
            positions.push("RM", "CM", "CM", "LM");
            positions.push("ST", "ST");
        }
        // Example for 3-5-2
        else if (formation === "3-5-2") {
            positions.push("CB", "CB", "CB");
            positions.push("RWB", "CM", "CM", "CM", "LWB");
            positions.push("ST", "ST");
        }
        // Example for 3-4-3
        else if (formation === "3-4-3") {
            positions.push("CB", "CB", "CB");
            positions.push("RM", "CM", "CM", "LM");
            positions.push("RW", "ST", "LW");
        }
        // Example for 5-3-2
        else if (formation === "5-3-2") {
            positions.push("RWB", "CB", "CB", "CB", "LWB");
            positions.push("CM", "CM", "CM");
            positions.push("ST", "ST");
        } 
        else if (formation == "5-4-1") {
            positions.push("RB", "CB", "CB", "CB", "LB");
            positions.push("RM", "CM", "CM", "LM");
            positions.push("ST");
        }
        else if (formation == "4-5-1") {
            positions.push("RB", "CB", "CB", "LB");
            positions.push("RM", "CM", "CM", "CM", "LM");
            positions.push("ST");
        }
        else {
            // Default positions if formation is not recognized
            for (let i = 0; i < lineup.length; i++) {
                positions.push(`P${i + 1}`);
            }
        }
    }  else if (formation === "4-2-3-1") {
        positions.push("GK");
        positions.push("RB", "CB", "CB", "LB");
        positions.push("CDM", "CDM");
        positions.push("RM", "CAM", "LM");
        positions.push("ST");
    } else if (formation === "4-1-4-1" ) {
        positions.push("GK");
        positions.push("RB", "CB", "CB", "LB");
        positions.push("CDM");
        positions.push("RM", "CAM", "CAM", "LM");
        positions.push("ST");
    } else if (formation == "4-3-2-1") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("CM", "CM", "CM");
      positions.push("CAM", "CAM");
      positions.push("ST");
    } else if (formation === "4-4-1-1") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("RM", "CM", "CM", "LM");
      positions.push("CAM");
      positions.push("ST");
    } else if (formation === "3-4-1-2") {
      positions.push("GK");
      positions.push("CB", "CB", "CB");
      positions.push("RM", "CM", "CM", "LM");
      positions.push("CAM");
      positions.push("ST", "ST");
    } else if (formation === "4-1-3-2") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("CDM");
      positions.push("RM", "CAM", "LM");
      positions.push("ST", "ST");
    } else if (formation === "4-2-2-2") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("CM", "CM");
      positions.push("CAM", "CAM");
      positions.push("ST", "ST");
    } else if (formation === "3-1-4-2") {
      positions.push("GK");
      positions.push("CB", "CB", "CB");
      positions.push("CDM");
      positions.push("RM", "CM", "CM", "LM");
      positions.push("ST", "ST");
    } else if (formation === "4-2-4") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("CM", "CM");
      positions.push("RW", "ST", "ST", "LW");
    } else if (formation === "4-3-1-2") {
      positions.push("GK");
      positions.push("RB", "CB", "CB", "LB");
      positions.push("CM", "CM", "CM");
      positions.push("CAM");
      positions.push("ST", "ST");
    } else if (formation === "3-5-1-1") {
      positions.push("GK");
      positions.push("CB", "CB", "CB");
      positions.push("RWB", "CM", "CM", "CM", "LWB");
      positions.push("CAM");
      positions.push("ST");
    } else if (formation === "3-4-2-1") {
      positions.push("GK");
      positions.push("CB", "CB", "CB");
      positions.push("RM", "CM", "CM", "LM");
      positions.push("CAM", "CAM");
      positions.push("ST");
    } else if (formation === "3-3-3-1") {
      positions.push("GK");
      positions.push("CB", "CB", "CB");
      positions.push("CM", "CM", "CM");
      positions.push("RW", "CAM", "LW");
      positions.push("ST");
    } else {
        // Default positions if formation is not recognized
        for (let i = 0; i < lineup.length; i++) {
            positions.push(`P${i + 1}`);
        }
    }


  return lineup.map((name, index) => ({
    id: index,
    name,
    position: positions[index],
    shirtNumber: lineupNumbers[index] ?? null,
    isCaptain: (lineupCaptains[index] ?? 0) > 0,
    goals: lineupGoals[index] ?? 0,
    assists: lineupAssists[index] ?? 0,
    yellowCards: hasColoredCards ? (lineupYellowCards[index] ?? 0) : undefined,
    redCards: hasColoredCards ? (lineupRedCards[index] ?? 0) : undefined,
    cards: lineupCards[index] ?? 0,
    substitutions: lineupSubstitutions[index] ?? 0,
  }))
}
