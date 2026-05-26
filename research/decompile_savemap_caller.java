// Decompile the callers of MapGenerator::saveMap + the polygon-processing path
// (boundary loading/simplification before rasterize) to research/ghidra_output/.
//@category Novabot
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.util.task.ConsoleTaskMonitor;
import java.io.PrintWriter;
import java.util.*;

public class decompile_savemap_caller extends GhidraScript {
  public void run() throws Exception {
    FunctionManager fm = currentProgram.getFunctionManager();
    ReferenceManager rm = currentProgram.getReferenceManager();
    ConsoleTaskMonitor mon = new ConsoleTaskMonitor();
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);

    Set<Function> targets = new HashSet<>();
    Set<Function> callers = new HashSet<>();
    for (Function f : fm.getFunctions(true)) {
      String n = f.getName();
      if (n.contains("saveMap") || n.contains("SimplifyPolygon") || n.contains("CleanPolygon")
          || n.contains("approxPolyDP") || n.equals("Mapping") || n.contains("MappingControl")
          || n.contains("Recording") || n.contains("buildMap") || n.contains("loadCsv")
          || n.contains("readCsv") || n.contains("readObstacle")) {
        targets.add(f);
        for (Reference r : rm.getReferencesTo(f.getEntryPoint())) {
          Function c = fm.getFunctionContaining(r.getFromAddress());
          if (c != null) callers.add(c);
        }
      }
    }
    Set<Function> all = new HashSet<>();
    all.addAll(targets); all.addAll(callers);
    // include callees of the callers (the processing helpers)
    for (Function c : new ArrayList<>(callers)) all.addAll(c.getCalledFunctions(mon));

    if (targets.isEmpty()) { println("[caller] no saveMap in " + currentProgram.getName() + ", skip"); return; }
    List<Function> sorted = new ArrayList<>(all);
    sorted.sort(Comparator.comparingLong(f -> f.getEntryPoint().getOffset()));
    PrintWriter out = new PrintWriter("/Users/rvbcrs/GitHub/Novabot/research/ghidra_output/savemap_caller_decompiled.c");
    out.println("// saveMap callers + polygon-processing path (targets=" + targets.size()
        + ", callers=" + callers.size() + ", total=" + all.size() + ")\n");
    int n = 0;
    for (Function f : sorted) {
      DecompileResults res = di.decompileFunction(f, 120, mon);
      if (res != null && res.decompileCompleted()) {
        out.println("// ===== " + f.getName() + " @ " + f.getEntryPoint() + " =====");
        out.println(res.getDecompiledFunction().getC());
        out.println();
        n++;
      }
    }
    out.close();
    println("[caller] wrote " + n + " functions (targets=" + targets.size() + ", callers=" + callers.size() + ")");
  }
}
