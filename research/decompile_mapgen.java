// Ghidra headless postScript (Java — no PyGhidra needed): decompile the
// functions implementing map_generator.cpp (the mower occupancy-grid generator)
// plus their direct callees, to research/ghidra_output/mapgen_decompiled.c
//@category Novabot
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.util.task.ConsoleTaskMonitor;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class decompile_mapgen extends GhidraScript {
  @Override
  public void run() throws Exception {
    FunctionManager fm = currentProgram.getFunctionManager();
    Listing listing = currentProgram.getListing();
    ReferenceManager refmgr = currentProgram.getReferenceManager();
    ConsoleTaskMonitor mon = new ConsoleTaskMonitor();
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);

    Set<Function> seed = new HashSet<>();
    DataIterator data = listing.getDefinedData(true);
    while (data.hasNext()) {
      Data d = data.next();
      Object v = d.getValue();
      if (v != null && v.toString().contains("map_generator")) {
        for (Reference ref : refmgr.getReferencesTo(d.getAddress())) {
          Function f = fm.getFunctionContaining(ref.getFromAddress());
          if (f != null) seed.add(f);
        }
      }
    }
    Set<Function> funcs = new HashSet<>(seed);
    for (Function f : new ArrayList<>(seed)) {
      funcs.addAll(f.getCalledFunctions(mon));
    }

    List<Function> sorted = new ArrayList<>(funcs);
    sorted.sort(Comparator.comparingLong(f -> f.getEntryPoint().getOffset()));

    PrintWriter out = new PrintWriter(
        "/Users/rvbcrs/GitHub/Novabot/research/ghidra_output/mapgen_decompiled.c");
    out.println("// novabot_mapping map_generator — decompiled (seed=" + seed.size()
        + ", +callees=" + funcs.size() + ")\n");
    int n = 0;
    for (Function f : sorted) {
      DecompileResults res = di.decompileFunction(f, 90, mon);
      if (res != null && res.decompileCompleted()) {
        out.println("// ===== " + f.getName() + " @ " + f.getEntryPoint() + " =====");
        out.println(res.getDecompiledFunction().getC());
        out.println();
        n++;
      }
    }
    out.close();
    println("[decompile_mapgen] wrote " + n + " functions (seed=" + seed.size() + ")");
  }
}
