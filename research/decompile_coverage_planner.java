// Decompile the coverage planner vendor-glue functions to
// research/ghidra_output/coverage_planner_decompiled.c.
//@category Novabot
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.util.task.ConsoleTaskMonitor;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class decompile_coverage_planner extends GhidraScript {
  public void run() throws Exception {
    FunctionManager fm = currentProgram.getFunctionManager();
    ConsoleTaskMonitor monitor = new ConsoleTaskMonitor();
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);

    Set<Long> targetOffsets = new HashSet<>();
    long[] offsets = new long[] {
      0x225a28L, // getCellIndexOfPoint
      0x226750L, // walkThroughGraph
      0x226a70L, // getTravellingPath
      0x228998L, // calculateCellIntersections
      0x22b1f0L, // calculateDecompositionAdjacency
      0x26c3c8L, // polygon_coverage_planning::checkObservability
      0x26f5b0L, // polygon_coverage_planning::computeSweep
      0x2f8610L, // BsdTspPlanner::calculateRotations
      0x2f8660L, // BsdTspPlanner::calculatePathLength
      0x2f8b70L, // BsdTspPlanner::pathAssessFunction
      0x2f8f90L, // coverage_plan::removeSelfIntersection
      0x2ff678L, // BsdTspPlanner::getPlan
      0x305a98L, // BsdTspPlanner::makePlan(cv::Mat)
      0x34c438L  // CoveragePlannerInterface::preprocessMap(single)
    };
    for (long offset : offsets) targetOffsets.add(offset);

    String[] needles = new String[] {
      "BsdTspPlanner::getPlan",
      "BsdTspPlanner::makePlan",
      "BsdTspPlanner::calculatePathLength",
      "BsdTspPlanner::calculateRotations",
      "BsdTspPlanner::pathAssessFunction",
      "removeSelfIntersection",
      "calculateDecompositionAdjacency",
      "calculateCellIntersections",
      "getCellIndexOfPoint",
      "getTravellingPath",
      "walkThroughGraph",
      "doReverseNextSweep",
      "pointToLineMinGridDis",
      "polygon_coverage_planning::checkObservability",
      "polygon_coverage_planning::computeSweep",
      "DoEdgesIntersect",
      "CoveragePlannerInterface::preprocessMap"
    };

    Set<Function> targets = new HashSet<>();
    for (Function f : fm.getFunctions(true)) {
      long offset = f.getEntryPoint().getOffset();
      String name = f.getName(true);
      if (targetOffsets.contains(offset)) {
        targets.add(f);
        continue;
      }
      for (String needle : needles) {
        if (name.contains(needle)) {
          targets.add(f);
          break;
        }
      }
    }

    List<Function> sorted = new ArrayList<>(targets);
    sorted.sort(Comparator.comparingLong(f -> f.getEntryPoint().getOffset()));

    String outPath = "/Users/rvbcrs/GitHub/Novabot/research/ghidra_output/coverage_planner_decompiled.c";
    PrintWriter out = new PrintWriter(outPath);
    out.println("// coverage planner vendor glue -- decompiled targets=" + sorted.size());
    out.println();
    int written = 0;
    for (Function f : sorted) {
      DecompileResults res = di.decompileFunction(f, 240, monitor);
      if (res != null && res.decompileCompleted()) {
        out.println("// ===== " + f.getName(true) + " @ " + f.getEntryPoint() + " =====");
        out.println(res.getDecompiledFunction().getC());
        out.println();
        written++;
      }
    }
    out.close();
    println("[decompile_coverage_planner] wrote " + written + " functions to " + outPath);
  }
}
