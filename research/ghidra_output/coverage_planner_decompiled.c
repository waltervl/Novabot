// coverage planner vendor glue -- decompiled targets=47

// ===== walkThroughGraph @ 00277220 =====

void walkThroughGraph(vector *param_1,int param_2,int *param_3,deque *param_4)

{
  (*(code *)PTR_walkThroughGraph_004df268)(param_1,param_2);
  return;
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMapReduceInflation @ 00277510 =====

void __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMapReduceInflation
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,Mat *param_3)

{
  (*(code *)PTR_preprocessMapReduceInflation_004df3e0)();
  return;
}



// ===== coverage_plan::DoEdgesIntersect @ 002783a0 =====

void coverage_plan::DoEdgesIntersect(Polygon_2 *param_1,Polygon_2 *param_2)

{
  (*(code *)PTR_DoEdgesIntersect_004dfb28)();
  return;
}



// ===== coverage_plan::BsdTspPlanner::calculatePathLength @ 00278750 =====

void coverage_plan::BsdTspPlanner::calculatePathLength(map *param_1)

{
  (*(code *)PTR_calculatePathLength_004dfd00)();
  return;
}



// ===== calculateDecompositionAdjacency @ 00278b20 =====

void calculateDecompositionAdjacency(vector *param_1)

{
  (*(code *)PTR_calculateDecompositionAdjacency_004dfee8)();
  return;
}



// ===== coverage_plan::BsdTspPlanner::getPlan @ 00278fc0 =====

void __thiscall
coverage_plan::BsdTspPlanner::getPlan
          (BsdTspPlanner *this,int param_1,int param_2,Mat *param_3,Mat *param_4,bool param_5,
          uchar param_6,map *param_7)

{
  (*(code *)PTR_getPlan_004e0138)(this,param_1,param_2,param_3,param_4,param_5,param_6);
  return;
}



// ===== polygon_coverage_planning::computeSweep @ 002798c0 =====

void polygon_coverage_planning::computeSweep(void)

{
  (*(code *)PTR_computeSweep_004e05b8)();
  return;
}



// ===== coverage_plan::BsdTspPlanner::calculateRotations @ 0027a200 =====

void coverage_plan::BsdTspPlanner::calculateRotations(map *param_1)

{
  (*(code *)PTR_calculateRotations_004e0a58)();
  return;
}



// ===== coverage_plan::removeSelfIntersection @ 0027a260 =====

void coverage_plan::removeSelfIntersection(vector *param_1,int *param_2)

{
  (*(code *)PTR_removeSelfIntersection_004e0a88)();
  return;
}



// ===== getTravellingPath @ 0027a9f0 =====

void getTravellingPath(vector *param_1,int param_2)

{
  (*(code *)PTR_getTravellingPath_004e0e50)(param_1,param_2);
  return;
}



// ===== getCellIndexOfPoint @ 0027abf0 =====

void getCellIndexOfPoint(vector *param_1,Point_2 *param_2)

{
  (*(code *)PTR_getCellIndexOfPoint_004e0f50)();
  return;
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMap @ 0027b080 =====

void __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMap
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,Mat *param_3)

{
  (*(code *)PTR_preprocessMap_004e1198)();
  return;
}



// ===== doReverseNextSweep @ 0027bb40 =====

void doReverseNextSweep(Point_2 *param_1,vector *param_2)

{
  (*(code *)PTR_doReverseNextSweep_004e16f8)();
  return;
}



// ===== calculateCellIntersections[abi:cxx11] @ 0027c020 =====

void calculateCellIntersections_abi_cxx11_(vector *param_1,vector *param_2)

{
  (*(code *)PTR_calculateCellIntersections_abi_cxx11__004e1968)();
  return;
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMap @ 0027cbd0 =====

void __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMap
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,int param_3,int param_4)

{
  (*(code *)PTR_preprocessMap_004e1f40)();
  return;
}



// ===== coverage_plan::BsdTspPlanner::pathAssessFunction @ 0027cda0 =====

void __thiscall
coverage_plan::BsdTspPlanner::pathAssessFunction
          (BsdTspPlanner *this,map *param_1,double param_2,double param_3,double param_4)

{
  (*(code *)PTR_pathAssessFunction_004e2028)();
  return;
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMapRect @ 0027d570 =====

void coverage_plan::CoveragePlannerInterface::preprocessMapRect
               (Mat *param_1,Mat *param_2,int param_3,int param_4)

{
  (*(code *)PTR_preprocessMapRect_004e2410)(param_1,param_2,param_3,param_4);
  return;
}



// ===== pointToLineMinGridDis @ 0027e520 =====

void pointToLineMinGridDis(int param_1,int param_2,int param_3,int param_4,int param_5,int param_6)

{
  (*(code *)PTR_pointToLineMinGridDis_004e2be8)(param_1,param_2,param_3,param_4,param_5,param_6);
  return;
}



// ===== polygon_coverage_planning::checkObservability @ 0027e990 =====

void polygon_coverage_planning::checkObservability(void)

{
  (*(code *)PTR_checkObservability_004e2e20)();
  return;
}



// ===== getCellIndexOfPoint @ 00325a28 =====

/* getCellIndexOfPoint(std::vector<CGAL::Polygon_2<CGAL::Epeck,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > >,
   std::allocator<CGAL::Polygon_2<CGAL::Epeck, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > > > > const&, CGAL::Point_2<CGAL::Epeck> const&) */

ulong getCellIndexOfPoint(vector *param_1,Point_2 *param_2)

{
  long *plVar1;
  long *plVar2;
  uint uVar3;
  double dVar4;
  char cVar5;
  long lVar6;
  Point_2 *pPVar7;
  Lazy_exact_nt *extraout_x1;
  Point_2 *extraout_x1_00;
  Lazy_exact_nt *extraout_x1_01;
  Point_2 *extraout_x1_02;
  Lazy_exact_nt *extraout_x1_03;
  Point_2 *extraout_x1_04;
  Lazy_exact_nt *extraout_x1_05;
  Point_2 *extraout_x1_06;
  Point_2 *extraout_x1_07;
  Point_2 *extraout_x1_08;
  Point_2 *extraout_x1_09;
  Point_2 *extraout_x1_10;
  long *plVar8;
  long lVar10;
  long *plVar11;
  Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
  *this;
  ulong uVar12;
  ulong uVar13;
  Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
  *pLVar14;
  long *plVar15;
  double dVar16;
  double dVar17;
  double dVar18;
  double dVar19;
  double dVar20;
  long *local_b0 [2];
  long *local_a0 [2];
  long *local_90 [2];
  long *local_80;
  long *plStack_78;
  long local_70;
  undefined8 local_60;
  undefined8 uStack_58;
  undefined8 local_50;
  undefined8 uStack_48;
  undefined8 local_40;
  undefined8 uStack_38;
  undefined8 local_30;
  undefined8 uStack_28;
  undefined8 local_20;
  undefined8 uStack_18;
  long local_8;
  long *plVar9;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  lVar6 = *(long *)param_1;
  if (*(long *)(param_1 + 8) == lVar6) {
    uVar13 = 0xffffffff;
  }
  else {
    uVar13 = 0;
    do {
      plVar1 = (long *)(lVar6 + uVar13 * 0x20);
      plVar15 = (long *)0x0;
      local_80 = (long *)0x0;
      plStack_78 = (long *)0x0;
      uVar12 = plVar1[1] - *(long *)(lVar6 + uVar13 * 0x20);
      local_70 = 0;
      if ((long)uVar12 >> 3 != 0) {
        if (0xfffffffffffffff < (ulong)((long)uVar12 >> 3)) {
                    /* WARNING: Subroutine does not return */
          std::__throw_bad_alloc();
        }
        plVar15 = operator_new(uVar12);
      }
      local_70 = (long)plVar15 + uVar12;
      plVar2 = (long *)*plVar1;
      plVar1 = (long *)plVar1[1];
      plVar8 = plVar2;
      plVar11 = plVar15;
      plStack_78 = plVar15;
      if (plVar2 != plVar1) {
        do {
          plVar9 = plVar8 + 1;
          lVar6 = *plVar8;
          *plVar11 = lVar6;
          *(int *)(lVar6 + 8) = *(int *)(lVar6 + 8) + 1;
          plVar8 = plVar9;
          plVar11 = plVar11 + 1;
        } while (plVar1 != plVar9);
        plStack_78 = (long *)((long)plVar15 + ((long)plVar1 - (long)plVar2));
      }
      local_60 = 0;
      uStack_58 = 0;
      local_50 = 0;
      uStack_48 = 0;
      local_40 = 0;
      uStack_38 = 0;
      local_30 = 0;
      uStack_28 = 0;
      local_20 = 0;
      uStack_18 = 0;
      local_80 = plVar15;
                    /* try { // try from 00325b30 to 00325b33 has its CatchHandler @ 00325e44 */
      std::
      _Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
      ::_M_initialize_map((_Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                           *)&local_60,0);
                    /* try { // try from 00325b3c to 00325b3f has its CatchHandler @ 00325d80 */
      cVar5 = polygon_coverage_planning::pointInPolygon((Polygon_with_holes_2 *)&local_80,param_2);
      std::
      deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
      ::~deque((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                *)&local_60);
      std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::~vector
                ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                 &local_80);
      dVar4 = DAT_0045ef40;
      if (cVar5 != '\0') {
        if (-1 < (int)uVar13) goto LAB_00325d14;
        lVar6 = *(long *)param_1;
        lVar10 = *(long *)(param_1 + 8);
        goto LAB_00325b78;
      }
      lVar6 = *(long *)param_1;
      lVar10 = *(long *)(param_1 + 8);
      uVar13 = (ulong)((int)uVar13 + 1);
    } while (uVar13 < (ulong)(lVar10 - lVar6 >> 5));
    uVar13 = 0xffffffff;
LAB_00325b78:
    if (lVar6 != lVar10) {
      uVar12 = 0;
      do {
        pPVar7 = (Point_2 *)(uVar12 * 0x20);
        this = *(Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                 **)(pPVar7 + lVar6);
        pLVar14 = *(Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                    **)(pPVar7 + lVar6 + 8);
        if (pLVar14 == this) {
LAB_00325d48:
          uVar13 = uVar12;
        }
        else {
          dVar20 = DAT_0045ef48;
          do {
            CGAL::
            Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
            ::operator()(this,pPVar7);
                    /* try { // try from 00325bd8 to 00325beb has its CatchHandler @ 00325e60 */
            dVar16 = (double)CGAL::
                             Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                             ::To_double::operator()((To_double *)local_b0,extraout_x1);
            CGAL::
            Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
            ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                          *)param_2,extraout_x1_00);
                    /* try { // try from 00325bf0 to 00325c03 has its CatchHandler @ 00325e68 */
            dVar17 = (double)CGAL::
                             Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                             ::To_double::operator()((To_double *)local_a0,extraout_x1_01);
            CGAL::
            Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
            ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                          *)this,extraout_x1_02);
                    /* try { // try from 00325c08 to 00325c1b has its CatchHandler @ 00325e70 */
            dVar18 = (double)CGAL::
                             Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                             ::To_double::operator()((To_double *)local_90,extraout_x1_03);
            CGAL::
            Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
            ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                          *)param_2,extraout_x1_04);
                    /* try { // try from 00325c20 to 00325c23 has its CatchHandler @ 00325da4 */
            dVar19 = (double)CGAL::
                             Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                             ::To_double::operator()((To_double *)&local_80,extraout_x1_05);
            dVar16 = ABS(dVar18 - dVar19) + ABS(dVar16 - dVar17);
            if (dVar16 <= dVar20) {
              dVar20 = dVar16;
            }
            pPVar7 = extraout_x1_06;
            if (local_80 != (long *)0x0) {
              uVar3 = (int)local_80[1] - 1;
              pPVar7 = (Point_2 *)(ulong)uVar3;
              *(uint *)(local_80 + 1) = uVar3;
              if (uVar3 == 0) {
                (**(code **)(*local_80 + 8))();
                pPVar7 = extraout_x1_07;
              }
            }
            if (local_90[0] != (long *)0x0) {
              uVar3 = (int)local_90[0][1] - 1;
              pPVar7 = (Point_2 *)(ulong)uVar3;
              *(uint *)(local_90[0] + 1) = uVar3;
              if (uVar3 == 0) {
                (**(code **)(*local_90[0] + 8))();
                pPVar7 = extraout_x1_08;
              }
            }
            if (local_a0[0] != (long *)0x0) {
              uVar3 = (int)local_a0[0][1] - 1;
              pPVar7 = (Point_2 *)(ulong)uVar3;
              *(uint *)(local_a0[0] + 1) = uVar3;
              if (uVar3 == 0) {
                (**(code **)(*local_a0[0] + 8))();
                pPVar7 = extraout_x1_09;
              }
            }
            if (local_b0[0] != (long *)0x0) {
              uVar3 = (int)local_b0[0][1] - 1;
              pPVar7 = (Point_2 *)(ulong)uVar3;
              *(uint *)(local_b0[0] + 1) = uVar3;
              if (uVar3 == 0) {
                (**(code **)(*local_b0[0] + 8))();
                pPVar7 = extraout_x1_10;
              }
            }
            this = this + 8;
          } while (pLVar14 != this);
          lVar6 = *(long *)param_1;
          lVar10 = *(long *)(param_1 + 8);
          if (dVar20 < dVar4) goto LAB_00325d48;
        }
        uVar12 = (ulong)((int)uVar12 + 1);
      } while (uVar12 < (ulong)(lVar10 - lVar6 >> 5));
    }
  }
LAB_00325d14:
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return uVar13;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(PTR___stack_chk_guard_004de1a8,local_8 - *(long *)PTR___stack_chk_guard_004de1a8,
                   0);
}



// ===== walkThroughGraphBFS @ 00325f68 =====

/* walkThroughGraphBFS(std::vector<CellNode, std::allocator<CellNode> >&, int, int&,
   std::deque<CellNode, std::allocator<CellNode> >&) */

void walkThroughGraphBFS(vector *param_1,int param_2,int *param_3,deque *param_4)

{
  CellNode *pCVar1;
  long lVar2;
  long lVar3;
  int iVar4;
  undefined4 uVar5;
  CellNode CVar6;
  undefined *puVar7;
  long lVar8;
  long *plVar9;
  long lVar10;
  long lVar11;
  long lVar12;
  undefined4 *puVar13;
  undefined4 *puVar14;
  undefined4 *puVar15;
  int *piVar16;
  long lVar17;
  undefined4 *puVar18;
  undefined4 *puVar19;
  long lVar20;
  int *piVar21;
  long *plVar22;
  int *piVar23;
  int *piVar24;
  undefined8 *local_98;
  int local_74 [4];
  int local_64;
  undefined8 local_60;
  undefined8 uStack_58;
  int *local_50;
  int *piStack_48;
  int *local_40;
  long local_38;
  int *local_30;
  undefined8 uStack_28;
  long local_20;
  undefined8 uStack_18;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  local_60 = 0;
  uStack_58 = 0;
  piStack_48 = (int *)0x0;
  local_50 = (int *)0x0;
  local_38 = 0;
  local_40 = (int *)0x0;
  uStack_28 = 0;
  local_30 = (int *)0x0;
  uStack_18 = 0;
  local_20 = 0;
  local_74[0] = param_2;
  std::_Deque_base<int,std::allocator<int>>::_M_initialize_map((ulong)&local_60);
  lVar11 = *(long *)param_1;
  lVar8 = (long)local_74[0] * 0x60;
  pCVar1 = (CellNode *)(lVar11 + lVar8);
  if (*(char *)(lVar11 + lVar8) == '\0') {
    iVar4 = *param_3;
    *(undefined1 *)(lVar11 + lVar8) = 1;
    *param_3 = iVar4 + -1;
  }
  lVar8 = *(long *)(param_4 + 0x10);
  if (lVar8 == *(long *)(param_4 + 0x18)) {
    std::deque<CellNode,std::allocator<CellNode>>::_M_push_front_aux<CellNode&>
              ((deque<CellNode,std::allocator<CellNode>> *)param_4,pCVar1);
    if (local_30 == (int *)(local_20 + -4)) goto LAB_003263a4;
  }
  else {
    CVar6 = pCVar1[1];
    uVar5 = *(undefined4 *)(pCVar1 + 4);
    *(undefined1 *)(lVar8 + -0x60) = 1;
    *(CellNode *)(lVar8 + -0x5f) = CVar6;
    *(undefined4 *)(lVar8 + -0x5c) = uVar5;
                    /* try { // try from 00326024 to 003263bb has its CatchHandler @ 003263c0 */
    std::deque<int,std::allocator<int>>::deque
              ((deque<int,std::allocator<int>> *)(lVar8 + -0x58),(deque *)(pCVar1 + 8));
    lVar11 = *(long *)(param_4 + 0x10);
    *(undefined4 *)(lVar8 + -8) = *(undefined4 *)(pCVar1 + 0x58);
    *(long *)(param_4 + 0x10) = lVar11 + -0x60;
    if (local_30 == (int *)(local_20 + -4)) {
LAB_003263a4:
      std::deque<int,std::allocator<int>>::_M_push_back_aux<int_const&>
                ((deque<int,std::allocator<int>> *)&local_60,local_74);
      goto LAB_0032605c;
    }
  }
  *local_30 = local_74[0];
  local_30 = local_30 + 1;
LAB_0032605c:
  puVar7 = PTR_do_widen_004de5e0;
  if (local_50 != local_30) {
    do {
      iVar4 = *local_50;
      if (local_50 == local_40 + -1) {
        operator_delete(piStack_48);
        local_50 = *(int **)(local_38 + 8);
        local_40 = local_50 + 0x80;
        piStack_48 = local_50;
        local_38 = local_38 + 8;
      }
      else {
        local_50 = local_50 + 1;
      }
      std::__ostream_insert<char,std::char_traits<char>>
                ((ostream *)PTR_cout_004de960,"Visiting node at index: ",0x18);
      plVar9 = (long *)std::ostream::operator<<((ostream *)PTR_cout_004de960,iVar4);
      plVar22 = *(long **)((long)plVar9 + *(long *)(*plVar9 + -0x18) + 0xf0);
      if (plVar22 == (long *)0x0) {
                    /* WARNING: Subroutine does not return */
        std::__throw_bad_cast();
      }
      if ((char)plVar22[7] == '\0') {
        std::ctype<char>::_M_widen_init();
        if (*(code **)(*plVar22 + 0x30) != (code *)puVar7) {
          (**(code **)(*plVar22 + 0x30))(plVar22,10);
        }
      }
      std::ostream::put((char)plVar9);
      std::ostream::flush();
      lVar8 = *(long *)param_1 + (long)iVar4 * 0x60;
      piVar21 = *(int **)(lVar8 + 0x18);
      piVar24 = *(int **)(lVar8 + 0x38);
      piVar23 = *(int **)(lVar8 + 0x28);
      local_98 = *(undefined8 **)(lVar8 + 0x30);
      piVar16 = local_30;
LAB_00326118:
      if (piVar24 != piVar21) {
        do {
          local_64 = *piVar21;
          lVar11 = *(long *)param_1;
          lVar8 = (long)local_64 * 0x60;
          if (*(char *)(lVar11 + lVar8) == '\0') {
            *(undefined1 *)(lVar11 + lVar8) = 1;
            *(int *)(lVar11 + lVar8 + 4) = iVar4;
            if (piVar16 == (int *)(local_20 + -4)) {
              std::deque<int,std::allocator<int>>::_M_push_back_aux<int_const&>
                        ((deque<int,std::allocator<int>> *)&local_60,&local_64);
              lVar11 = *(long *)param_1;
            }
            else {
              local_30 = piVar16 + 1;
              *piVar16 = local_64;
            }
            lVar8 = *(long *)(param_4 + 0x10);
            pCVar1 = (CellNode *)(lVar11 + (long)local_64 * 0x60);
            if (lVar8 == *(long *)(param_4 + 0x18)) {
              std::deque<CellNode,std::allocator<CellNode>>::_M_push_front_aux<CellNode&>
                        ((deque<CellNode,std::allocator<CellNode>> *)param_4,pCVar1);
              piVar16 = local_30;
            }
            else {
              lVar17 = *(long *)(pCVar1 + 0x28);
              lVar2 = *(long *)(pCVar1 + 0x30);
              lVar10 = *(long *)(pCVar1 + 0x38);
              lVar3 = *(long *)(pCVar1 + 0x40);
              lVar12 = *(long *)(pCVar1 + 0x50);
              lVar20 = *(long *)(pCVar1 + 0x18);
              uVar5 = *(undefined4 *)(pCVar1 + 4);
              CVar6 = pCVar1[1];
              *(undefined1 *)(lVar8 + -0x60) = *(undefined1 *)(lVar11 + (long)local_64 * 0x60);
              *(CellNode *)(lVar8 + -0x5f) = CVar6;
              *(undefined4 *)(lVar8 + -0x5c) = uVar5;
              *(undefined8 *)(lVar8 + -0x58) = 0;
              *(undefined8 *)(lVar8 + -0x50) = 0;
              *(undefined8 *)(lVar8 + -0x48) = 0;
              *(undefined8 *)(lVar8 + -0x40) = 0;
              *(undefined8 *)(lVar8 + -0x38) = 0;
              *(undefined8 *)(lVar8 + -0x30) = 0;
              *(undefined8 *)(lVar8 + -0x28) = 0;
              *(undefined8 *)(lVar8 + -0x20) = 0;
              *(undefined8 *)(lVar8 + -0x18) = 0;
              *(undefined8 *)(lVar8 + -0x10) = 0;
              std::_Deque_base<int,std::allocator<int>>::_M_initialize_map
                        ((_Deque_base<int,std::allocator<int>> *)(lVar8 + -0x58),
                         (lVar10 - lVar3 >> 2) + ((lVar12 - lVar2 >> 3) + -1) * 0x80 +
                         (lVar17 - lVar20 >> 2));
              puVar18 = *(undefined4 **)(pCVar1 + 0x28);
              lVar17 = *(long *)(pCVar1 + 0x30);
              puVar14 = *(undefined4 **)(pCVar1 + 0x18);
              puVar19 = *(undefined4 **)(lVar8 + -0x38);
              lVar10 = (*(long *)(pCVar1 + 0x38) - *(long *)(pCVar1 + 0x40) >> 2) +
                       ((*(long *)(pCVar1 + 0x50) - lVar17 >> 3) + -1) * 0x80 +
                       ((long)puVar18 - (long)puVar14 >> 2);
              puVar13 = *(undefined4 **)(lVar8 + -0x48);
              lVar11 = *(long *)(lVar8 + -0x30);
              if (0 < lVar10) {
                do {
                  puVar15 = puVar14 + 1;
                  *puVar13 = *puVar14;
                  puVar14 = puVar15;
                  if (puVar15 == puVar18) goto LAB_003262f8;
                  while (puVar13 = puVar13 + 1, puVar13 == puVar19) {
                    puVar13 = *(undefined4 **)(lVar11 + 8);
                    lVar10 = lVar10 + -1;
                    lVar11 = lVar11 + 8;
                    puVar19 = puVar13 + 0x80;
                    if (lVar10 == 0) goto LAB_0032624c;
                    puVar15 = puVar14 + 1;
                    *puVar13 = *puVar14;
                    puVar14 = puVar15;
                    if (puVar15 == puVar18) {
LAB_003262f8:
                      puVar14 = *(undefined4 **)(lVar17 + 8);
                      lVar17 = lVar17 + 8;
                      puVar18 = puVar14 + 0x80;
                    }
                  }
                  lVar10 = lVar10 + -1;
                } while (lVar10 != 0);
              }
LAB_0032624c:
              lVar11 = *(long *)(param_4 + 0x10);
              *(undefined4 *)(lVar8 + -8) = *(undefined4 *)(pCVar1 + 0x58);
              *(long *)(param_4 + 0x10) = lVar11 + -0x60;
              piVar16 = local_30;
            }
          }
          piVar21 = piVar21 + 1;
          if (piVar23 != piVar21) goto LAB_00326118;
          local_98 = local_98 + 1;
          piVar21 = (int *)*local_98;
          piVar23 = piVar21 + 0x80;
          if (piVar24 == piVar21) break;
        } while( true );
      }
    } while (local_50 != piVar16);
  }
  std::_Deque_base<int,std::allocator<int>>::~_Deque_base
            ((_Deque_base<int,std::allocator<int>> *)&local_60);
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(PTR___stack_chk_guard_004de1a8,
                     local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return;
}



// ===== doReverseNextSweep @ 003263d8 =====

/* doReverseNextSweep(CGAL::Point_2<CGAL::Epeck> const&, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > const&) */

bool doReverseNextSweep(Point_2 *param_1,vector *param_2)

{
  int iVar1;
  Lazy_exact_nt *extraout_x1;
  Lazy_exact_nt *extraout_x1_00;
  double dVar2;
  double dVar3;
  Epeck aEStack_30 [8];
  long *local_28 [2];
  long *local_18 [2];
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  CGAL::internal::squared_distance<CGAL::Epeck>
            ((Point_2 *)param_1,*(Point_2 **)param_2,(Epeck *)local_18);
                    /* try { // try from 00326428 to 00326447 has its CatchHandler @ 00326538 */
  dVar2 = (double)CGAL::
                  Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                  ::To_double::operator()((To_double *)local_28,extraout_x1);
  CGAL::internal::squared_distance<CGAL::Epeck>
            ((Point_2 *)param_1,(Point_2 *)(*(long *)(param_2 + 8) + -8),aEStack_30);
                    /* try { // try from 0032644c to 0032644f has its CatchHandler @ 003264e0 */
  dVar3 = (double)CGAL::
                  Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                  ::To_double::operator()((To_double *)local_18,extraout_x1_00);
  if ((local_18[0] != (long *)0x0) &&
     (iVar1 = (int)local_18[0][1] + -1, *(int *)(local_18[0] + 1) = iVar1, iVar1 == 0)) {
    (**(code **)(*local_18[0] + 8))();
  }
  if ((local_28[0] != (long *)0x0) &&
     (iVar1 = (int)local_28[0][1] + -1, *(int *)(local_28[0] + 1) = iVar1, iVar1 == 0)) {
    (**(code **)(*local_28[0] + 8))();
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return dVar3 < dVar2;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== walkThroughGraph @ 00326750 =====

/* walkThroughGraph(std::vector<CellNode, std::allocator<CellNode> >&, int, int&,
   std::deque<CellNode, std::allocator<CellNode> >&) */

void walkThroughGraph(vector *param_1,int param_2,int *param_3,deque *param_4)

{
  CellNode *pCVar1;
  undefined4 uVar2;
  CellNode CVar3;
  char cVar4;
  long lVar5;
  long lVar6;
  ulong uVar7;
  ulong uVar8;
  long lVar9;
  int *piVar10;
  int iVar11;
  long lVar12;
  long lVar13;
  ulong uVar14;
  long lVar15;
  undefined8 local_68;
  undefined8 uStack_60;
  undefined8 local_58;
  undefined8 uStack_50;
  undefined8 local_48;
  undefined8 uStack_40;
  undefined8 local_38;
  undefined8 uStack_30;
  undefined8 local_28;
  undefined8 uStack_20;
  undefined4 local_18;
  long local_8;
  
  lVar15 = (long)param_2 * 0x60;
  lVar5 = *(long *)param_1;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  pCVar1 = (CellNode *)(lVar5 + lVar15);
  if (*(char *)(lVar5 + lVar15) == '\0') {
    iVar11 = *param_3;
    *(undefined1 *)(lVar5 + lVar15) = 1;
    *param_3 = iVar11 + -1;
  }
  lVar5 = *(long *)(param_4 + 0x10);
  if (lVar5 == *(long *)(param_4 + 0x18)) {
    std::deque<CellNode,std::allocator<CellNode>>::_M_push_front_aux<CellNode&>
              ((deque<CellNode,std::allocator<CellNode>> *)param_4,pCVar1);
  }
  else {
    CVar3 = pCVar1[1];
    uVar2 = *(undefined4 *)(pCVar1 + 4);
    *(undefined1 *)(lVar5 + -0x60) = 1;
    *(CellNode *)(lVar5 + -0x5f) = CVar3;
    *(undefined4 *)(lVar5 + -0x5c) = uVar2;
    std::deque<int,std::allocator<int>>::deque
              ((deque<int,std::allocator<int>> *)(lVar5 + -0x58),(deque *)(pCVar1 + 8));
    lVar6 = *(long *)(param_4 + 0x10);
    *(undefined4 *)(lVar5 + -8) = *(undefined4 *)(pCVar1 + 0x58);
    *(long *)(param_4 + 0x10) = lVar6 + -0x60;
  }
  local_68 = 0;
  uStack_60 = 0;
  uStack_50 = 0;
  local_58 = 0;
  uStack_40 = 0;
  local_48 = 0;
  uStack_30 = 0;
  local_38 = 0;
  uStack_20 = 0;
  local_28 = 0;
  std::_Deque_base<int,std::allocator<int>>::_M_initialize_map((ulong)&local_68);
  lVar13 = *(long *)param_1;
  lVar5 = lVar13 + lVar15;
  lVar6 = *(long *)(lVar5 + 0x30);
  local_18 = 0x7fffffff;
  lVar9 = *(long *)(lVar5 + 0x18);
  if ((*(long *)(lVar5 + 0x38) - *(long *)(lVar5 + 0x40) >> 2) +
      ((*(long *)(lVar5 + 0x50) - lVar6 >> 3) + -1) * 0x80 + (*(long *)(lVar5 + 0x28) - lVar9 >> 2)
      == 0) {
    uVar14 = 0x7fffffff;
    iVar11 = 0x7fffffff;
LAB_00326978:
    uVar8 = (*(long *)(param_1 + 8) - lVar13 >> 5) * -0x5555555555555555;
    if (uVar14 <= uVar8 && uVar8 - uVar14 != 0) {
      *(undefined4 *)(lVar13 + uVar14 * 0x60 + 4) = *(undefined4 *)(lVar5 + 0x58);
                    /* try { // try from 00326a40 to 00326a43 has its CatchHandler @ 00326a58 */
      walkThroughGraph(param_1,iVar11,param_3,param_4);
      goto LAB_003269b0;
    }
  }
  else {
    uVar14 = 0;
    lVar12 = lVar9 - *(long *)(lVar5 + 0x20);
    do {
      uVar8 = uVar14 + (lVar12 >> 2);
      if ((long)uVar8 < 0) {
        uVar7 = ~(~uVar8 >> 7);
LAB_00326948:
        piVar10 = (int *)(*(long *)(lVar6 + uVar7 * 8) + (uVar8 + uVar7 * -0x80) * 4);
      }
      else {
        if (0x7f < (long)uVar8) {
          uVar7 = (long)uVar8 >> 7;
          goto LAB_00326948;
        }
        piVar10 = (int *)(lVar9 + uVar14 * 4);
      }
      lVar5 = lVar13 + (long)*piVar10 * 0x60;
      cVar4 = *(char *)(lVar13 + (long)*piVar10 * 0x60);
                    /* try { // try from 003268bc to 00326a0f has its CatchHandler @ 00326a58 */
      std::deque<int,std::allocator<int>>::operator=
                ((deque<int,std::allocator<int>> *)&local_68,(deque *)(lVar5 + 8));
      lVar13 = *(long *)param_1;
      local_18 = *(undefined4 *)(lVar5 + 0x58);
      lVar5 = lVar13 + lVar15;
      lVar9 = *(long *)(lVar5 + 0x18);
      lVar6 = *(long *)(lVar5 + 0x30);
      lVar12 = lVar9 - *(long *)(lVar5 + 0x20);
      uVar8 = uVar14 + (lVar12 >> 2);
      if ((long)uVar8 < 0) {
        uVar7 = ~(~uVar8 >> 7);
LAB_0032695c:
        piVar10 = (int *)(*(long *)(lVar6 + uVar7 * 8) + (uVar8 + uVar7 * -0x80) * 4);
      }
      else {
        if (0x7f < (long)uVar8) {
          uVar7 = (long)uVar8 >> 7;
          goto LAB_0032695c;
        }
        piVar10 = (int *)(lVar9 + uVar14 * 4);
      }
      if (cVar4 == '\0') {
        iVar11 = *piVar10;
        uVar14 = (ulong)iVar11;
        goto LAB_00326978;
      }
      uVar14 = uVar14 + 1;
    } while (uVar14 < (ulong)((*(long *)(lVar5 + 0x38) - *(long *)(lVar5 + 0x40) >> 2) +
                              ((*(long *)(lVar5 + 0x50) - lVar6 >> 3) + -1) * 0x80 +
                             (*(long *)(lVar5 + 0x28) - lVar9 >> 2)));
  }
  if ((*(int *)(lVar5 + 4) != 0x7fffffff) && (*param_3 != 0)) {
    walkThroughGraph(param_1,*(int *)(lVar5 + 4),param_3,param_4);
  }
LAB_003269b0:
  std::_Deque_base<int,std::allocator<int>>::~_Deque_base
            ((_Deque_base<int,std::allocator<int>> *)&local_68);
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return;
}



// ===== getTravellingPath @ 00326a70 =====

/* getTravellingPath(std::vector<CellNode, std::allocator<CellNode> > const&, int) */

void getTravellingPath(vector *param_1,int param_2)

{
  undefined1 *puVar1;
  undefined8 uVar2;
  undefined8 uVar3;
  undefined8 uVar4;
  undefined8 uVar5;
  undefined4 uVar6;
  undefined1 uVar7;
  undefined1 *puVar8;
  long *plVar9;
  undefined1 *puVar10;
  long *plVar11;
  undefined1 *puVar12;
  long *plVar13;
  undefined1 *puVar14;
  undefined1 *puVar15;
  bool bVar16;
  bool bVar17;
  void *pvVar18;
  undefined8 uVar19;
  undefined8 *puVar20;
  undefined8 uVar21;
  undefined8 uVar22;
  undefined8 *puVar23;
  undefined4 *puVar24;
  long lVar25;
  long lVar26;
  long lVar27;
  long lVar28;
  undefined8 uVar29;
  undefined8 uVar30;
  deque<int,std::allocator<int>> *in_x8;
  undefined8 uVar31;
  int *extraout_x10;
  int *piVar32;
  undefined1 *puVar33;
  undefined1 *puVar34;
  long *plVar35;
  int iVar36;
  ulong uVar37;
  long *plVar38;
  undefined1 *puVar39;
  long lVar40;
  undefined8 *puVar41;
  ulong uVar42;
  long lVar43;
  undefined1 *puVar44;
  undefined8 local_1a0;
  undefined8 local_198;
  long *local_190;
  long *local_160;
  undefined1 *local_158;
  undefined1 *local_140;
  undefined1 *puStack_138;
  undefined1 *local_130;
  undefined8 local_120;
  undefined8 uStack_118;
  undefined8 uStack_110;
  undefined8 uStack_108;
  undefined8 local_100;
  undefined8 uStack_f8;
  undefined8 uStack_f0;
  undefined8 uStack_e8;
  undefined8 local_e0;
  undefined8 uStack_d8;
  undefined8 uStack_d0;
  undefined8 uStack_c8;
  void *local_c0;
  long local_b8;
  undefined1 *local_b0;
  undefined1 *puStack_a8;
  undefined1 *local_a0;
  long *local_98;
  undefined1 *local_90;
  undefined1 *puStack_88;
  undefined1 *local_80;
  long *local_78;
  undefined1 local_70;
  undefined1 local_6f;
  undefined4 local_6c;
  long local_68;
  undefined8 local_60;
  undefined8 local_58;
  undefined8 local_50;
  undefined8 local_48;
  undefined8 *local_40;
  undefined8 local_38;
  undefined8 local_30;
  undefined8 local_28;
  undefined8 *local_20;
  undefined4 local_18;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  *(undefined8 *)in_x8 = 0;
  *(undefined8 *)(in_x8 + 8) = 0;
  *(undefined8 *)(in_x8 + 0x18) = 0;
  *(undefined8 *)(in_x8 + 0x10) = 0;
  *(undefined8 *)(in_x8 + 0x28) = 0;
  *(undefined8 *)(in_x8 + 0x20) = 0;
  *(undefined8 *)(in_x8 + 0x38) = 0;
  *(undefined8 *)(in_x8 + 0x30) = 0;
  *(undefined8 *)(in_x8 + 0x48) = 0;
  *(undefined8 *)(in_x8 + 0x40) = 0;
  std::_Deque_base<int,std::allocator<int>>::_M_initialize_map((ulong)in_x8);
  local_c0 = (void *)0x0;
  local_b8 = 8;
  puStack_a8 = (undefined1 *)0x0;
  local_b0 = (undefined1 *)0x0;
  local_98 = (long *)0x0;
  local_a0 = (undefined1 *)0x0;
  puStack_88 = (undefined1 *)0x0;
  local_90 = (undefined1 *)0x0;
  local_78 = (long *)0x0;
  local_80 = (undefined1 *)0x0;
                    /* try { // try from 00326ae4 to 00326ae7 has its CatchHandler @ 00327414 */
  pvVar18 = operator_new(0x40);
  uVar37 = local_b8 - 1U >> 1;
  plVar38 = (long *)((long)pvVar18 + uVar37 * 8);
  local_c0 = pvVar18;
                    /* try { // try from 00326b04 to 00326b07 has its CatchHandler @ 00327464 */
  local_b0 = operator_new(0x1e0);
  puVar33 = *(undefined1 **)param_1;
  puVar34 = *(undefined1 **)(param_1 + 8);
  local_a0 = local_b0 + 0x1e0;
  *(undefined1 **)((long)pvVar18 + uVar37 * 8) = local_b0;
  local_140 = (undefined1 *)0x0;
  puStack_138 = (undefined1 *)0x0;
  puVar44 = (undefined1 *)0x0;
  uVar42 = (long)puVar34 - (long)puVar33;
  local_130 = (undefined1 *)0x0;
  uVar37 = ((long)uVar42 >> 5) * -0x5555555555555555;
  puStack_a8 = local_b0;
  local_98 = plVar38;
  local_90 = local_b0;
  puStack_88 = local_b0;
  local_80 = local_a0;
  local_78 = plVar38;
  if (uVar37 != 0) {
    if (0x155555555555555 < uVar37) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 0032740c to 0032740f has its CatchHandler @ 0032741c */
      std::__throw_bad_alloc();
    }
                    /* try { // try from 00326b60 to 00326b63 has its CatchHandler @ 0032741c */
    puVar44 = operator_new(uVar42);
    puVar33 = *(undefined1 **)param_1;
    puVar34 = *(undefined1 **)(param_1 + 8);
  }
  local_130 = puVar44 + uVar42;
  local_140 = puVar44;
  puStack_138 = puVar44;
  if (puVar33 == puVar34) {
    piVar32 = (int *)&local_e0;
    iVar36 = 0;
  }
  else {
    do {
      lVar40 = *(long *)(puVar33 + 0x30);
      lVar43 = *(long *)(puVar33 + 0x38);
      lVar25 = *(long *)(puVar33 + 0x50);
      lVar28 = *(long *)(puVar33 + 0x18);
      lVar26 = *(long *)(puVar33 + 0x40);
      *puVar44 = *puVar33;
      uVar6 = *(undefined4 *)(puVar33 + 4);
      lVar27 = *(long *)(puVar33 + 0x28);
      puVar44[1] = puVar33[1];
      *(undefined4 *)(puVar44 + 4) = uVar6;
      *(undefined8 *)(puVar44 + 8) = 0;
      *(undefined8 *)(puVar44 + 0x10) = 0;
      *(undefined8 *)(puVar44 + 0x18) = 0;
      *(undefined8 *)(puVar44 + 0x20) = 0;
      *(undefined8 *)(puVar44 + 0x28) = 0;
      *(undefined8 *)(puVar44 + 0x30) = 0;
      *(undefined8 *)(puVar44 + 0x38) = 0;
      *(undefined8 *)(puVar44 + 0x40) = 0;
      *(undefined8 *)(puVar44 + 0x48) = 0;
      *(undefined8 *)(puVar44 + 0x50) = 0;
                    /* try { // try from 00326c04 to 00326c07 has its CatchHandler @ 00327450 */
      std::_Deque_base<int,std::allocator<int>>::_M_initialize_map
                ((_Deque_base<int,std::allocator<int>> *)(puVar44 + 8),
                 (lVar43 - lVar26 >> 2) + ((lVar25 - lVar40 >> 3) + -1) * 0x80 +
                 (lVar27 - lVar28 >> 2));
      uStack_118 = *(undefined8 *)(puVar33 + 0x20);
      local_120 = *(undefined8 *)(puVar33 + 0x18);
      uStack_108 = *(undefined8 *)(puVar33 + 0x30);
      uStack_110 = *(undefined8 *)(puVar33 + 0x28);
      uStack_d8 = *(undefined8 *)(puVar44 + 0x20);
      local_e0 = *(undefined8 *)(puVar44 + 0x18);
      uStack_c8 = *(undefined8 *)(puVar44 + 0x30);
      uStack_d0 = *(undefined8 *)(puVar44 + 0x28);
      puVar39 = puVar33 + 0x60;
      uStack_f8 = *(undefined8 *)(puVar33 + 0x40);
      local_100 = *(undefined8 *)(puVar33 + 0x38);
      puVar1 = puVar44 + 0x60;
      uStack_e8 = *(undefined8 *)(puVar33 + 0x50);
      uStack_f0 = *(undefined8 *)(puVar33 + 0x48);
      std::
      __uninitialized_copy_a<std::_Deque_iterator<int,int_const&,int_const*>,std::_Deque_iterator<int,int&,int*>,int>
                (&local_70,&local_120,&local_100,&local_e0);
      *(undefined4 *)(puVar44 + 0x58) = *(undefined4 *)(puVar33 + 0x58);
      puVar33 = puVar39;
      puVar44 = puVar1;
    } while (puVar34 != puVar39);
    iVar36 = (int)((long)puVar1 - (long)local_140 >> 5) * -0x55555555;
    piVar32 = extraout_x10;
    puStack_138 = puVar1;
    if ((long)puVar1 - (long)local_140 == 0x60) {
      puVar24 = *(undefined4 **)(in_x8 + 0x30);
      if (puVar24 == (undefined4 *)(*(long *)(in_x8 + 0x40) + -4)) {
        lVar40 = *(long *)(in_x8 + 0x48);
        if (((long)puVar24 - *(long *)(in_x8 + 0x38) >> 2) +
            ((lVar40 - *(long *)(in_x8 + 0x28) >> 3) + -1) * 0x80 +
            (*(long *)(in_x8 + 0x20) - *(long *)(in_x8 + 0x10) >> 2) == 0x1fffffffffffffff) {
                    /* WARNING: Subroutine does not return */
          std::__throw_length_error("cannot create std::deque larger than max_size()");
        }
        if ((ulong)(*(long *)(in_x8 + 8) - (lVar40 - *(long *)in_x8 >> 3)) < 2) {
          std::deque<int,std::allocator<int>>::_M_reallocate_map(in_x8,1,false);
          lVar40 = *(long *)(in_x8 + 0x48);
        }
        pvVar18 = operator_new(0x200);
        *(void **)(lVar40 + 8) = pvVar18;
        lVar40 = *(long *)(in_x8 + 0x48);
        lVar43 = *(long *)(lVar40 + 8);
        **(undefined4 **)(in_x8 + 0x30) = 0;
        *(long *)(in_x8 + 0x38) = lVar43;
        *(long *)(in_x8 + 0x40) = lVar43 + 0x200;
        *(long *)(in_x8 + 0x48) = lVar40 + 8;
        *(long *)(in_x8 + 0x30) = lVar43;
        puVar33 = local_90;
      }
      else {
        *puVar24 = 0;
        *(undefined4 **)(in_x8 + 0x30) = puVar24 + 1;
        puVar33 = local_90;
      }
      goto LAB_00326fc8;
    }
  }
  local_e0 = CONCAT44(local_e0._4_4_,iVar36);
                    /* try { // try from 00326c98 to 0032740b has its CatchHandler @ 0032742c */
  walkThroughGraph((vector *)&local_140,param_2,piVar32,(deque *)&local_c0);
  local_190 = local_98;
  local_158 = puStack_88;
  local_160 = local_78;
  puVar33 = local_b0;
  if (local_90 != local_b0) {
    puVar34 = local_90;
    if (local_90 == puStack_88) {
      local_158 = (undefined1 *)local_78[-1];
      local_160 = local_78 + -1;
      puVar34 = local_158 + 0x1e0;
    }
    puVar34 = puVar34 + -0x60;
    bVar16 = local_98 <= local_160;
    bVar17 = false;
    puVar44 = local_b0;
    puVar39 = local_a0;
    if (local_160 == local_98) goto LAB_00326fa8;
    while (puVar33 = local_90, bVar16 && !bVar17) {
      while( true ) {
        local_6c = *(undefined4 *)(puVar44 + 4);
        local_70 = *puVar44;
        local_6f = puVar44[1];
        local_68 = 0;
        local_60 = 0;
        local_58 = 0;
        local_50 = 0;
        local_48 = 0;
        local_40 = (undefined8 *)0x0;
        local_38 = 0;
        local_30 = 0;
        local_28 = 0;
        local_20 = (undefined8 *)0x0;
        std::_Deque_base<int,std::allocator<int>>::_M_initialize_map((ulong)&local_68);
        lVar40 = *(long *)(puVar44 + 8);
        uVar19 = *(undefined8 *)(puVar44 + 0x10);
        uVar29 = uVar19;
        if (lVar40 != 0) {
          uVar21 = *(undefined8 *)(puVar44 + 0x18);
          uVar2 = *(undefined8 *)(puVar44 + 0x20);
          uVar22 = *(undefined8 *)(puVar44 + 0x28);
          uVar3 = *(undefined8 *)(puVar44 + 0x30);
          *(undefined8 *)(puVar44 + 0x18) = local_58;
          *(undefined8 *)(puVar44 + 0x20) = local_50;
          *(undefined8 *)(puVar44 + 0x28) = local_48;
          *(undefined8 **)(puVar44 + 0x30) = local_40;
          uVar30 = *(undefined8 *)(puVar44 + 0x38);
          uVar4 = *(undefined8 *)(puVar44 + 0x40);
          uVar31 = *(undefined8 *)(puVar44 + 0x48);
          uVar5 = *(undefined8 *)(puVar44 + 0x50);
          *(undefined8 *)(puVar44 + 0x38) = local_38;
          *(undefined8 *)(puVar44 + 0x40) = local_30;
          *(undefined8 *)(puVar44 + 0x48) = local_28;
          *(undefined8 **)(puVar44 + 0x50) = local_20;
          *(long *)(puVar44 + 8) = local_68;
          *(undefined8 *)(puVar44 + 0x10) = local_60;
          uVar29 = local_60;
          local_68 = lVar40;
          local_60 = uVar19;
          local_58 = uVar21;
          local_50 = uVar2;
          local_48 = uVar22;
          local_40 = (undefined8 *)uVar3;
          local_38 = uVar30;
          local_30 = uVar4;
          local_28 = uVar31;
          local_20 = (undefined8 *)uVar5;
        }
        local_18 = *(undefined4 *)(puVar44 + 0x58);
        uVar7 = puVar34[1];
        uVar19 = *(undefined8 *)(puVar44 + 0x18);
        uVar21 = *(undefined8 *)(puVar44 + 0x20);
        uVar31 = *(undefined8 *)(puVar44 + 0x28);
        uVar6 = *(undefined4 *)(puVar34 + 4);
        *puVar44 = *puVar34;
        puVar44[1] = uVar7;
        uVar30 = *(undefined8 *)(puVar44 + 0x30);
        *(undefined4 *)(puVar44 + 4) = uVar6;
        uVar22 = *(undefined8 *)(puVar34 + 0x20);
        *(undefined8 *)(puVar44 + 0x18) = *(undefined8 *)(puVar34 + 0x18);
        *(undefined8 *)(puVar44 + 0x20) = uVar22;
        uVar22 = *(undefined8 *)(puVar34 + 0x30);
        *(undefined8 *)(puVar44 + 0x28) = *(undefined8 *)(puVar34 + 0x28);
        *(undefined8 *)(puVar44 + 0x30) = uVar22;
        *(undefined8 *)(puVar34 + 0x18) = uVar19;
        *(undefined8 *)(puVar34 + 0x20) = uVar21;
        *(undefined8 *)(puVar34 + 0x28) = uVar31;
        *(undefined8 *)(puVar34 + 0x30) = uVar30;
        uVar21 = *(undefined8 *)(puVar34 + 0x40);
        uVar19 = *(undefined8 *)(puVar44 + 0x38);
        uVar22 = *(undefined8 *)(puVar44 + 0x40);
        *(undefined8 *)(puVar44 + 0x38) = *(undefined8 *)(puVar34 + 0x38);
        *(undefined8 *)(puVar44 + 0x40) = uVar21;
        uVar30 = *(undefined8 *)(puVar34 + 0x50);
        uVar21 = *(undefined8 *)(puVar44 + 0x48);
        uVar31 = *(undefined8 *)(puVar44 + 0x50);
        *(undefined8 *)(puVar44 + 0x48) = *(undefined8 *)(puVar34 + 0x48);
        *(undefined8 *)(puVar44 + 0x50) = uVar30;
        *(undefined8 *)(puVar34 + 0x38) = uVar19;
        *(undefined8 *)(puVar34 + 0x40) = uVar22;
        *(undefined8 *)(puVar34 + 0x48) = uVar21;
        *(undefined8 *)(puVar34 + 0x50) = uVar31;
        uVar19 = *(undefined8 *)(puVar44 + 8);
        *(undefined8 *)(puVar44 + 8) = *(undefined8 *)(puVar34 + 8);
        *(undefined8 *)(puVar34 + 8) = uVar19;
        lVar40 = *(long *)(puVar34 + 0x50);
        *(undefined8 *)(puVar44 + 0x10) = *(undefined8 *)(puVar34 + 0x10);
        puVar20 = *(undefined8 **)(puVar34 + 0x30);
        *(undefined8 *)(puVar34 + 0x10) = uVar29;
        uVar21 = *(undefined8 *)(puVar34 + 0x20);
        uVar22 = *(undefined8 *)(puVar34 + 0x28);
        uVar30 = *(undefined8 *)(puVar34 + 0x18);
        puVar23 = puVar20;
        uVar19 = uVar22;
        puVar41 = puVar20 + 1;
        local_1a0 = uVar21;
        local_198 = uVar30;
        if (puVar20 + 1 < (undefined8 *)(lVar40 + 8U)) {
          do {
            puVar23 = puVar41 + 1;
            operator_delete((void *)*puVar41);
            puVar41 = puVar23;
          } while (puVar23 < (undefined8 *)(lVar40 + 8U));
          uVar29 = *(undefined8 *)(puVar34 + 0x10);
          puVar23 = *(undefined8 **)(puVar34 + 0x30);
          uVar19 = *(undefined8 *)(puVar34 + 0x28);
          local_1a0 = *(undefined8 *)(puVar34 + 0x20);
          local_198 = *(undefined8 *)(puVar34 + 0x18);
        }
        *(undefined8 *)(puVar34 + 0x38) = uVar30;
        *(undefined8 *)(puVar34 + 0x40) = uVar21;
        *(undefined8 *)(puVar34 + 0x48) = uVar22;
        *(undefined8 **)(puVar34 + 0x50) = puVar20;
        *(undefined4 *)(puVar44 + 0x58) = *(undefined4 *)(puVar34 + 0x58);
        *puVar34 = local_70;
        puVar34[1] = local_6f;
        *(undefined4 *)(puVar34 + 4) = local_6c;
        *(undefined8 *)(puVar34 + 0x18) = local_58;
        *(undefined8 *)(puVar34 + 0x20) = local_50;
        *(undefined8 *)(puVar34 + 0x28) = local_48;
        *(undefined8 **)(puVar34 + 0x30) = local_40;
        uVar21 = *(undefined8 *)(puVar34 + 0x38);
        uVar30 = *(undefined8 *)(puVar34 + 0x40);
        *(undefined8 *)(puVar34 + 0x38) = local_38;
        *(undefined8 *)(puVar34 + 0x40) = local_30;
        uVar22 = *(undefined8 *)(puVar34 + 0x48);
        lVar40 = *(long *)(puVar34 + 0x50);
        *(undefined8 *)(puVar34 + 0x48) = local_28;
        *(undefined8 **)(puVar34 + 0x50) = local_20;
        uVar31 = *(undefined8 *)(puVar34 + 8);
        *(long *)(puVar34 + 8) = local_68;
        *(undefined8 *)(puVar34 + 0x10) = local_60;
        local_38 = uVar21;
        local_30 = uVar30;
        local_28 = uVar22;
        local_20 = (undefined8 *)lVar40;
        local_68 = uVar31;
        local_40 = puVar23;
        local_60 = uVar29;
        local_48 = uVar19;
        local_58 = local_198;
        local_50 = local_1a0;
        puVar41 = puVar23;
        while (puVar41 = puVar41 + 1, puVar41 < (undefined8 *)(lVar40 + 8U)) {
          operator_delete((void *)*puVar41);
        }
        local_38 = local_198;
        local_30 = local_1a0;
        puVar44 = puVar44 + 0x60;
        *(undefined4 *)(puVar34 + 0x58) = local_18;
        local_28 = uVar19;
        local_20 = puVar23;
        std::_Deque_base<int,std::allocator<int>>::~_Deque_base
                  ((_Deque_base<int,std::allocator<int>> *)&local_68);
        if (puVar44 == puVar39) {
          local_190 = local_190 + 1;
          puVar44 = (undefined1 *)*local_190;
          puVar39 = puVar44 + 0x1e0;
        }
        if (local_158 == puVar34) {
          local_160 = local_160 + -1;
          local_158 = (undefined1 *)*local_160;
          puVar34 = local_158 + 0x1e0;
        }
        puVar34 = puVar34 + -0x60;
        bVar16 = local_190 <= local_160;
        bVar17 = local_160 == local_190;
        if (!bVar17) break;
LAB_00326fa8:
        puVar33 = local_90;
        if (puVar34 <= puVar44) goto LAB_00326fc8;
      }
    }
  }
LAB_00326fc8:
  plVar38 = local_98 + 1;
  puVar34 = local_b0;
  puVar44 = local_a0;
  while (puVar39 = local_140, puVar1 = puStack_138, puVar10 = puStack_138, puVar33 != puVar34) {
    while( true ) {
      puVar24 = *(undefined4 **)(in_x8 + 0x30);
      if (puVar24 == (undefined4 *)(*(long *)(in_x8 + 0x40) + -4)) {
        lVar40 = *(long *)(in_x8 + 0x48);
        if (((long)puVar24 - *(long *)(in_x8 + 0x38) >> 2) +
            ((lVar40 - *(long *)(in_x8 + 0x28) >> 3) + -1) * 0x80 +
            (*(long *)(in_x8 + 0x20) - *(long *)(in_x8 + 0x10) >> 2) == 0x1fffffffffffffff) {
                    /* WARNING: Subroutine does not return */
          std::__throw_length_error("cannot create std::deque larger than max_size()");
        }
        if ((ulong)(*(long *)(in_x8 + 8) - (lVar40 - *(long *)in_x8 >> 3)) < 2) {
          std::deque<int,std::allocator<int>>::_M_reallocate_map(in_x8,1,false);
          lVar40 = *(long *)(in_x8 + 0x48);
        }
        pvVar18 = operator_new(0x200);
        uVar6 = *(undefined4 *)(puVar34 + 0x58);
        *(void **)(lVar40 + 8) = pvVar18;
        lVar40 = *(long *)(in_x8 + 0x48);
        lVar43 = *(long *)(lVar40 + 8);
        **(undefined4 **)(in_x8 + 0x30) = uVar6;
        *(long *)(in_x8 + 0x38) = lVar43;
        *(long *)(in_x8 + 0x40) = lVar43 + 0x200;
        *(long *)(in_x8 + 0x48) = lVar40 + 8;
        *(long *)(in_x8 + 0x30) = lVar43;
      }
      else {
        *puVar24 = *(undefined4 *)(puVar34 + 0x58);
        *(undefined4 **)(in_x8 + 0x30) = puVar24 + 1;
      }
      puVar34 = puVar34 + 0x60;
      if (puVar44 != puVar34) break;
      puVar34 = (undefined1 *)*plVar38;
      puVar44 = puVar34 + 0x1e0;
      plVar38 = plVar38 + 1;
      puVar39 = local_140;
      puVar1 = puStack_138;
      puVar10 = puStack_138;
      if (puVar33 == puVar34) goto joined_r0x00327024;
    }
  }
joined_r0x00327024:
  for (; puVar33 = puStack_138, puVar39 != puStack_138; puVar39 = puVar39 + 0x60) {
    puStack_138 = puVar10;
    std::_Deque_base<int,std::allocator<int>>::~_Deque_base
              ((_Deque_base<int,std::allocator<int>> *)(puVar39 + 8));
    puVar1 = local_140;
    puVar10 = puStack_138;
    puStack_138 = puVar33;
  }
  puStack_138 = puVar10;
  puVar34 = local_b0;
  puVar44 = local_a0;
  plVar35 = local_98;
  puVar39 = local_90;
  puVar8 = puStack_88;
  plVar9 = local_78;
  plVar38 = local_98;
  plVar11 = local_78;
  puVar33 = puStack_88;
  puVar12 = local_90;
  plVar13 = local_98;
  puVar14 = local_a0;
  puVar15 = local_b0;
  if (puVar1 != (undefined1 *)0x0) {
    operator_delete(puVar1);
    puVar34 = local_b0;
    puVar44 = local_a0;
    plVar35 = local_98;
    puVar39 = local_90;
    puVar8 = puStack_88;
    plVar9 = local_78;
    plVar38 = local_98;
    plVar11 = local_78;
    puVar33 = puStack_88;
    puVar12 = local_90;
    plVar13 = local_98;
    puVar14 = local_a0;
    puVar15 = local_b0;
  }
  while (local_b0 = puVar15, local_a0 = puVar14, local_98 = plVar13, local_90 = puVar12,
        puStack_88 = puVar33, local_78 = plVar11, plVar11 = local_78, puVar33 = puStack_88,
        puVar12 = local_90, plVar13 = local_98, puVar14 = local_a0, puVar15 = local_b0,
        plVar38 = plVar38 + 1, local_a0 = puVar44, local_90 = puVar39, puStack_88 = puVar8,
        plVar38 < local_78) {
    lVar43 = *plVar38;
    lVar40 = lVar43 + 0x1e0;
    local_b0 = puVar34;
    local_98 = plVar35;
    local_78 = plVar9;
    do {
      pvVar18 = *(void **)(lVar43 + 8);
      if (pvVar18 != (void *)0x0) {
        puVar23 = (undefined8 *)(*(long *)(lVar43 + 0x50) + 8);
        puVar41 = *(undefined8 **)(lVar43 + 0x30);
        if (*(undefined8 **)(lVar43 + 0x30) < puVar23) {
          do {
            puVar20 = puVar41 + 1;
            operator_delete((void *)*puVar41);
            puVar41 = puVar20;
          } while (puVar20 < puVar23);
          pvVar18 = *(void **)(lVar43 + 8);
        }
        operator_delete(pvVar18);
      }
      lVar43 = lVar43 + 0x60;
      puVar34 = local_b0;
      puVar44 = local_a0;
      plVar35 = local_98;
      puVar39 = local_90;
      puVar8 = puStack_88;
      plVar9 = local_78;
    } while (lVar43 != lVar40);
  }
  bVar17 = local_98 == local_78;
  puVar44 = local_b0;
  local_98 = plVar35;
  local_78 = plVar9;
  if (bVar17) {
    for (; local_b0 = puVar34, puVar44 != puVar12; puVar44 = puVar44 + 0x60) {
      std::_Deque_base<int,std::allocator<int>>::~_Deque_base
                ((_Deque_base<int,std::allocator<int>> *)(puVar44 + 8));
      puVar34 = local_b0;
    }
  }
  else {
    for (; local_b0 = puVar34, puVar44 != puVar14; puVar44 = puVar44 + 0x60) {
      std::_Deque_base<int,std::allocator<int>>::~_Deque_base
                ((_Deque_base<int,std::allocator<int>> *)(puVar44 + 8));
      puVar34 = local_b0;
    }
    for (; puVar12 != puVar33; puVar33 = puVar33 + 0x60) {
      std::_Deque_base<int,std::allocator<int>>::~_Deque_base
                ((_Deque_base<int,std::allocator<int>> *)(puVar33 + 8));
    }
  }
  if (local_c0 != (void *)0x0) {
    plVar38 = local_78 + 1;
    for (plVar35 = local_98; plVar35 < plVar38; plVar35 = plVar35 + 1) {
      operator_delete((void *)*plVar35);
    }
    operator_delete(local_c0);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(PTR___stack_chk_guard_004de1a8,local_8 - *(long *)PTR___stack_chk_guard_004de1a8,
                   0);
}



// ===== calculateCellIntersections[abi:cxx11] @ 00328998 =====

/* WARNING: Type propagation algorithm not settling */
/* calculateCellIntersections[abi:cxx11](std::vector<CGAL::Polygon_2<CGAL::Epeck,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > >,
   std::allocator<CGAL::Polygon_2<CGAL::Epeck, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > > > >&, std::vector<CellNode,
   std::allocator<CellNode> >&) */

long * calculateCellIntersections_abi_cxx11_(vector *param_1,vector *param_2)

{
  undefined *puVar1;
  undefined *puVar2;
  Point_2 *pPVar3;
  undefined8 *puVar4;
  char cVar5;
  Default_event *pDVar6;
  undefined8 *******pppppppuVar7;
  undefined *puVar8;
  undefined *puVar9;
  No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
  *pNVar10;
  bool bVar11;
  ulong uVar12;
  void *pvVar13;
  long lVar14;
  long *plVar15;
  long *plVar16;
  long lVar17;
  long *plVar18;
  long *plVar19;
  long *plVar20;
  int *piVar21;
  long *plVar22;
  undefined *puVar23;
  undefined4 *puVar24;
  _List_node_base *p_Var25;
  int iVar26;
  long lVar27;
  long extraout_x1;
  long extraout_x1_00;
  long extraout_x1_01;
  long extraout_x1_02;
  void *pvVar28;
  long lVar29;
  undefined1 *puVar30;
  code *pcVar31;
  long *plVar32;
  undefined **ppuVar33;
  undefined *puVar34;
  long lVar35;
  long *plVar36;
  long lVar37;
  long lVar38;
  undefined **ppuVar39;
  long *in_x8;
  long lVar40;
  ulong uVar41;
  void *pvVar42;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *p_Var43;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *p_Var44;
  Node *pNVar45;
  undefined8 *******pppppppuVar46;
  Default_event *pDVar47;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *p_Var48;
  void *pvVar49;
  long *plVar50;
  uint uVar51;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *p_Var52;
  long *plVar53;
  Default_event *pDVar54;
  undefined8 extraout_d0;
  undefined8 uVar55;
  double dVar56;
  double extraout_d0_00;
  double extraout_d0_01;
  double extraout_d0_02;
  double extraout_d0_03;
  undefined8 extraout_var;
  undefined8 uVar57;
  double dVar58;
  double dVar59;
  double dVar60;
  double dVar61;
  undefined1 auVar62 [16];
  undefined1 auVar63 [12];
  long *local_448;
  ulong local_438;
  long *local_430;
  undefined *local_3a8;
  undefined1 auStack_390 [8];
  Default_event *local_388;
  long *local_380;
  long *plStack_378;
  long *local_370;
  long *local_360;
  long *plStack_358;
  undefined8 local_350;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_348;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *p_Stack_340;
  long local_338;
  undefined *local_330;
  No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
  *local_328;
  _List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_320;
  ulong local_318;
  long *local_310;
  long *local_308;
  long local_300;
  long lStack_2f8;
  ulong local_2f0;
  long lStack_2e8;
  long local_2e0;
  long lStack_2d8;
  long local_2d0;
  long lStack_2c8;
  undefined *local_2c0;
  undefined1 *local_2b8;
  ulong local_2b0;
  long local_2a8;
  undefined1 *local_2a0;
  long *local_298;
  undefined1 *local_290;
  long lStack_288;
  long local_280;
  long *local_278;
  undefined *local_268;
  undefined8 local_260;
  undefined8 local_258;
  undefined8 uStack_250;
  undefined1 *local_248;
  long *plStack_240;
  undefined1 local_228;
  undefined8 local_220;
  undefined8 uStack_218;
  undefined8 local_210;
  undefined1 auStack_208 [8];
  undefined1 local_200;
  undefined8 local_1f8;
  undefined8 uStack_1f0;
  undefined8 local_1e8;
  undefined *local_1e0;
  undefined8 local_1d8;
  undefined8 local_1d0;
  undefined8 uStack_1c8;
  undefined1 local_1b0;
  undefined8 local_1a8;
  undefined8 uStack_1a0;
  undefined8 local_198;
  undefined1 local_188;
  undefined8 local_180;
  undefined8 uStack_178;
  undefined8 local_170;
  undefined1 *local_168;
  long local_158;
  long local_150 [3];
  undefined1 local_138 [8];
  undefined1 *local_130;
  undefined8 local_128;
  undefined4 local_120;
  undefined8 local_118;
  undefined8 uStack_110;
  undefined8 local_108;
  undefined8 local_100;
  long local_e8;
  long local_e0;
  long local_d8;
  undefined2 local_cf;
  undefined8 local_c8;
  undefined8 uStack_c0;
  undefined4 local_b8;
  undefined **local_b0;
  undefined8 *******local_a8;
  undefined8 *******local_a0;
  undefined8 uStack_98;
  undefined1 local_90;
  long local_88;
  undefined8 local_80;
  undefined4 local_78;
  undefined8 local_70;
  void *local_68;
  void *local_60;
  void *local_58;
  undefined8 local_50;
  long *local_48;
  long *local_40;
  long *local_38;
  long *local_28;
  long *local_20;
  long *local_18;
  undefined2 local_f;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  lVar35 = *(long *)(param_2 + 8);
  lVar27 = *(long *)param_2;
  lVar40 = lVar35 - lVar27 >> 5;
  uVar12 = lVar40 * -0x5555555555555555;
  if (0x2aaaaaaaaaaaaaa < uVar12) {
                    /* WARNING: Subroutine does not return */
    std::__throw_length_error("cannot create std::vector larger than max_size()");
  }
  *in_x8 = 0;
  in_x8[1] = 0;
  uVar41 = lVar40 * 0x10;
  in_x8[2] = 0;
  pvVar28 = (void *)0x0;
  if (uVar12 != 0) {
    pvVar13 = operator_new(uVar41);
    pvVar28 = (void *)((long)pvVar13 + uVar41);
    *in_x8 = (long)pvVar13;
    in_x8[2] = (long)pvVar28;
    do {
      *(undefined4 *)((long)pvVar13 + 8) = 0;
      *(undefined8 *)((long)pvVar13 + 0x10) = 0;
      *(long *)((long)pvVar13 + 0x18) = (long)pvVar13 + 8;
      *(long *)((long)pvVar13 + 0x20) = (long)pvVar13 + 8;
      *(undefined8 *)((long)pvVar13 + 0x28) = 0;
      pvVar13 = (void *)((long)pvVar13 + 0x30);
    } while (pvVar13 != pvVar28);
    lVar27 = *(long *)param_2;
    lVar35 = *(long *)(param_2 + 8);
  }
  local_3a8 = (undefined *)0x0;
  in_x8[1] = (long)pvVar28;
  puVar1 = PTR_vtable_004deb50 + 0x10;
  if (lVar35 != lVar27) {
    do {
      local_438 = 0;
      lVar35 = (long)local_3a8 * 0x20;
      lVar40 = (long)local_3a8 * 0x60;
LAB_00328aa0:
      lVar17 = lVar27 + lVar40;
      lVar38 = *(long *)(lVar17 + 0x30);
      lVar37 = *(long *)(lVar17 + 0x18);
      if (local_438 <
          (ulong)((*(long *)(lVar17 + 0x38) - *(long *)(lVar17 + 0x40) >> 2) +
                  ((*(long *)(lVar17 + 0x50) - lVar38 >> 3) + -1) * 0x80 +
                 (*(long *)(lVar17 + 0x28) - lVar37 >> 2))) {
        lVar27 = *(long *)param_1;
        plVar53 = (long *)(lVar27 + lVar35);
        local_338 = 0;
        local_348 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                     *)&local_348;
        p_Stack_340 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_348;
        if (*(long **)(lVar27 + lVar35) != (long *)plVar53[1]) {
          lVar29 = lVar37 - *(long *)(lVar17 + 0x20);
          lVar14 = local_438 * 4;
          local_430 = *(long **)(lVar27 + lVar35);
          do {
            uVar12 = local_438 + (lVar29 >> 2);
            if ((long)uVar12 < 0) {
              uVar41 = ~(~uVar12 >> 7);
LAB_0032a8b0:
              piVar21 = (int *)(*(long *)(lVar38 + uVar41 * 8) + (uVar12 + uVar41 * -0x80) * 4);
            }
            else {
              if (0x7f < (long)uVar12) {
                uVar41 = (long)uVar12 >> 7;
                goto LAB_0032a8b0;
              }
              piVar21 = (int *)(lVar37 + lVar14);
            }
            plVar50 = local_430 + 1;
            plVar22 = (long *)(lVar27 + (long)*piVar21 * 0x20);
            local_448 = *(long **)(lVar27 + (long)*piVar21 * 0x20);
            puVar2 = PTR_vtable_004dec40 + 0x10;
            uVar12 = local_438 + (lVar29 >> 2);
            if ((long)uVar12 < 0) goto LAB_00329a64;
LAB_00328ba8:
            if (0x7f < (long)uVar12) {
              uVar41 = (long)uVar12 >> 7;
              goto LAB_00329ad0;
            }
            if (*(long **)(lVar27 + (long)*(int *)(lVar37 + lVar14) * 0x20 + 8) != local_448) {
              do {
                plVar36 = plVar50;
                if ((long *)plVar53[1] == plVar50) {
                  plVar36 = (long *)*plVar53;
                }
                uVar55 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 00328bf8 to 00328bfb has its CatchHandler @ 0032b00c */
                plVar15 = operator_new(0x68);
                plVar36 = (long *)*plVar36;
                local_2d0 = plVar36[4];
                lStack_2c8 = plVar36[5];
                lVar27 = *local_430;
                local_2e0 = plVar36[2];
                lStack_2d8 = plVar36[3];
                local_300 = *(long *)(lVar27 + 0x10);
                lStack_2f8 = *(long *)(lVar27 + 0x18);
                local_2f0 = *(long *)(lVar27 + 0x20);
                lStack_2e8 = *(long *)(lVar27 + 0x28);
                *(undefined4 *)(plVar15 + 1) = 1;
                lVar27 = plVar36[1];
                plVar15[2] = local_300;
                plVar15[3] = lStack_2f8;
                *plVar15 = (long)puVar2;
                plVar15[4] = local_2f0;
                plVar15[5] = lStack_2e8;
                plVar15[6] = local_2e0;
                plVar15[7] = lStack_2d8;
                plVar15[8] = local_2d0;
                plVar15[9] = lStack_2c8;
                plVar15[10] = 0;
                plVar15[0xb] = (long)plVar36;
                *(int *)(plVar36 + 1) = (int)lVar27 + 1;
                plVar16 = (long *)*local_430;
                plVar15[0xc] = (long)plVar16;
                iVar26 = (int)plVar16[1];
                *(int *)(plVar16 + 1) = iVar26 + 1;
                local_310 = plVar15;
                local_2c0 = (undefined *)local_300;
                local_2b8 = (undefined1 *)lStack_2f8;
                local_2b0 = local_2f0;
                local_2a8 = lStack_2e8;
                local_2a0 = (undefined1 *)local_2e0;
                local_298 = (long *)lStack_2d8;
                local_290 = (undefined1 *)local_2d0;
                lStack_288 = lStack_2c8;
                if ((int)plVar15[1] == 0) {
                  *plVar15 = (long)puVar2;
                  *(int *)(plVar16 + 1) = iVar26;
                  if (iVar26 == 0) {
                    (**(code **)(*plVar16 + 8))();
                    plVar36 = (long *)plVar15[0xb];
                    if (plVar36 != (long *)0x0) goto LAB_00329da0;
                  }
                  else {
LAB_00329da0:
                    iVar26 = (int)plVar36[1] + -1;
                    *(int *)(plVar36 + 1) = iVar26;
                    if (iVar26 == 0) {
                      (**(code **)(*plVar36 + 8))(plVar36);
                    }
                  }
                  pvVar28 = (void *)plVar15[10];
                  *plVar15 = (long)(PTR_vtable_004de220 + 0x10);
                  if (pvVar28 != (void *)0x0) {
                    pvVar13 = (void *)((long)pvVar28 + 0x80);
                    do {
                      pvVar49 = (void *)((long)pvVar13 + -0x40);
                      do {
                        pvVar42 = (void *)((long)pvVar13 + -0x20);
                        if ((*(long *)((long)pvVar13 + -0x18) != 0) ||
                           (*(long *)((long)pvVar13 + -8) != 0)) {
                          __gmpq_clear(pvVar42);
                        }
                        pvVar13 = pvVar42;
                      } while (pvVar49 != pvVar42);
                      pvVar13 = pvVar49;
                    } while (pvVar28 != pvVar49);
                    operator_delete(pvVar28,0x80);
                  }
                  operator_delete(plVar15,0x68);
                }
                fpcr = uVar55;
                plVar36 = local_448 + 1;
                plVar15 = plVar36;
                if (plVar36 == (long *)plVar22[1]) {
                  plVar15 = (long *)*plVar22;
                }
                uVar55 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 00328d54 to 00328d57 has its CatchHandler @ 0032ab34 */
                plVar16 = operator_new(0x68);
                plVar15 = (long *)*plVar15;
                local_2e0 = plVar15[2];
                lStack_2d8 = plVar15[3];
                local_2d0 = plVar15[4];
                lStack_2c8 = plVar15[5];
                lVar27 = *local_448;
                puVar23 = PTR_vtable_004dec40 + 0x10;
                local_300 = *(long *)(lVar27 + 0x10);
                lStack_2f8 = *(long *)(lVar27 + 0x18);
                local_2f0 = *(ulong *)(lVar27 + 0x20);
                lStack_2e8 = *(long *)(lVar27 + 0x28);
                *(undefined4 *)(plVar16 + 1) = 1;
                *plVar16 = (long)puVar23;
                plVar16[2] = local_300;
                plVar16[3] = lStack_2f8;
                plVar16[4] = local_2f0;
                plVar16[5] = lStack_2e8;
                plVar16[6] = local_2e0;
                plVar16[7] = lStack_2d8;
                plVar16[8] = local_2d0;
                plVar16[9] = lStack_2c8;
                plVar16[10] = 0;
                plVar16[0xb] = (long)plVar15;
                local_448 = (long *)*local_448;
                *(int *)(plVar15 + 1) = (int)plVar15[1] + 1;
                plVar16[0xc] = (long)local_448;
                iVar26 = (int)local_448[1];
                *(int *)(local_448 + 1) = iVar26 + 1;
                local_308 = plVar16;
                local_2b0 = local_2f0;
                local_2a8 = lStack_2e8;
                lStack_288 = lStack_2c8;
                if ((int)plVar16[1] == 0) {
                  *plVar16 = (long)puVar23;
                  *(int *)(local_448 + 1) = iVar26;
                  local_2c0 = (undefined *)local_300;
                  local_2b8 = (undefined1 *)lStack_2f8;
                  local_2a0 = (undefined1 *)local_2e0;
                  local_298 = (long *)lStack_2d8;
                  local_290 = (undefined1 *)local_2d0;
                  if (iVar26 == 0) {
                    (**(code **)(*local_448 + 8))();
                    plVar15 = (long *)plVar16[0xb];
                    if (plVar15 != (long *)0x0) goto LAB_00329d7c;
                  }
                  else {
LAB_00329d7c:
                    iVar26 = (int)plVar15[1] + -1;
                    *(int *)(plVar15 + 1) = iVar26;
                    if (iVar26 == 0) {
                      (**(code **)(*plVar15 + 8))(plVar15);
                    }
                  }
                  pvVar28 = (void *)plVar16[10];
                  *plVar16 = (long)(PTR_vtable_004de220 + 0x10);
                  if (pvVar28 != (void *)0x0) {
                    pvVar13 = (void *)((long)pvVar28 + 0x80);
                    do {
                      pvVar49 = (void *)((long)pvVar13 + -0x40);
                      do {
                        pvVar42 = (void *)((long)pvVar13 + -0x20);
                        if ((*(long *)((long)pvVar13 + -0x18) != 0) ||
                           (*(long *)((long)pvVar13 + -8) != 0)) {
                          __gmpq_clear(pvVar42);
                        }
                        pvVar13 = pvVar42;
                      } while (pvVar49 != pvVar42);
                      pvVar13 = pvVar49;
                    } while (pvVar28 != pvVar49);
                    operator_delete(pvVar28,0x80);
                  }
                  operator_delete(plVar16,0x68);
                }
                fpcr = uVar55;
                local_2b8 = auStack_390;
                local_298 = &local_2a8;
                local_330 = PTR_vtable_004de7f8 + 0x10;
                local_328 = (No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                             *)0x0;
                local_2c0 = PTR_vtable_004defa0 + 0x10;
                local_318 = local_318 & 0xffffffffffffff00;
                local_2b0 = local_2b0 & 0xffffffffffffff00;
                local_320 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                             *)&local_348;
                local_2a0 = local_2b8;
                local_290 = local_2b8;
                    /* try { // try from 00328ed8 to 00328edb has its CatchHandler @ 0032aa88 */
                local_278 = operator_new(0x90);
                local_260 = 0;
                local_268 = PTR_vtable_004dea98 + 0x10;
                local_278[3] = 0;
                local_278[2] = 0;
                lVar27 = tpidr_el0;
                uStack_250 = 0;
                local_258 = 0;
                local_228 = 2;
                local_210 = 0;
                uStack_218 = 0;
                local_220 = 0;
                local_1e0 = PTR_vtable_004de860 + 0x10;
                *local_278 = (long)(PTR_vtable_004de850 + 0x10);
                local_278[1] = 0;
                uStack_1f0 = 0;
                local_1f8 = 0;
                local_1e8 = 0;
                local_200 = 3;
                local_1d8 = 0;
                uStack_1c8 = 0;
                local_1d0 = 0;
                uStack_1a0 = 0;
                local_1a8 = 0;
                local_278[4] = (long)local_290;
                local_278[5] = lStack_288;
                local_278[6] = local_280;
                *(undefined1 *)(local_278 + 9) = 2;
                local_278[0xb] = 0;
                local_278[10] = 0;
                local_278[0xc] = 0;
                *(undefined1 *)(local_278 + 0xe) = 3;
                local_278[0x10] = 0;
                local_278[0xf] = 0;
                local_278[0x11] = 0;
                local_248 = local_2a0;
                plStack_240 = local_298;
                local_198 = 0;
                local_1b0 = 2;
                local_188 = 3;
                lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                local_170 = 0;
                local_168 = auStack_208;
                local_180 = extraout_d0;
                uStack_178 = extraout_var;
                if ((*(ulong *)(lVar27 + lVar17) & 1) == 0) {
                    /* try { // try from 00329f30 to 00329f33 has its CatchHandler @ 0032aad4 */
                  plVar15 = operator_new(0x38);
                  ppuVar33 = &PTR_EscapePrecFlag_004de000;
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  ppuVar39 = &PTR_EscapePrecFlag_004de000;
                  *(long **)(lVar27 + lVar17) = plVar15;
                  auVar62 = (*(code *)PTR_004e3200)(&PTR_004e3200,lVar27 + lVar17);
                  plVar15[6] = 0;
                  *(undefined4 *)(plVar15 + 1) = 1;
                  puVar34 = ppuVar33[0x1c3];
                  *(undefined8 *)(lVar27 + auVar62._0_8_) = 1;
                  puVar23 = ppuVar39[0x10f];
                  *plVar15 = (long)(puVar34 + 0x10);
                  __cxa_thread_atexit(puVar23,auVar62._8_8_,&__dso_handle);
                }
                lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                plVar15 = local_150;
                lVar37 = *(long *)(lVar27 + lVar17);
                lVar17 = (*(code *)PTR_004e2f60)(&PTR_004e2f60);
                uVar12 = *(ulong *)(lVar27 + lVar17);
                local_130 = local_138;
                *(int *)(lVar37 + 8) = *(int *)(lVar37 + 8) + 1;
                local_158 = lVar37;
                *plVar15 = (long)local_150;
                plVar15[1] = (long)local_150;
                plVar15[2] = 0;
                plVar15[3] = (long)local_130;
                local_128 = 0;
                local_120 = 0x1040400;
                local_118 = 0;
                uStack_110 = 0;
                local_108 = 0;
                local_100 = 0;
                if ((uVar12 & 1) == 0) {
                    /* try { // try from 00329ec0 to 00329ec3 has its CatchHandler @ 0032aef0 */
                  plVar15 = operator_new(0x48);
                  ppuVar33 = &PTR_EscapePrecFlag_004de000;
                  lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                  ppuVar39 = &PTR_EscapePrecFlag_004de000;
                  *(long **)(lVar27 + lVar17) = plVar15;
                  auVar62 = (*(code *)PTR_004e2f60)(&PTR_004e2f60,lVar27 + lVar17);
                  plVar15[8] = 0;
                  *(undefined4 *)(plVar15 + 1) = 1;
                  puVar34 = ppuVar33[0x1bd];
                  *(undefined8 *)(lVar27 + auVar62._0_8_) = 1;
                  puVar23 = ppuVar39[0xef];
                  *plVar15 = (long)(puVar34 + 0x10);
                  __cxa_thread_atexit(puVar23,auVar62._8_8_,&__dso_handle);
                }
                lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                auVar62 = (*(code *)PTR_004e3200)(&PTR_004e3200,*(undefined8 *)(lVar27 + lVar17));
                local_e8 = auVar62._8_8_;
                uVar12 = *(ulong *)(lVar27 + auVar62._0_8_);
                *(int *)(local_e8 + 8) = *(int *)(local_e8 + 8) + 1;
                if ((uVar12 & 1) == 0) {
                    /* try { // try from 00329dc8 to 00329dcb has its CatchHandler @ 0032af54 */
                  plVar16 = operator_new(0x38);
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  puVar34 = PTR_vtable_004dee18;
                  plVar15 = (long *)(lVar27 + lVar17);
                  *(long **)(lVar27 + lVar17) = plVar16;
                  lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                  *(undefined8 *)(lVar27 + lVar17) = 1;
                  puVar23 = PTR__Lazy_004de878;
                  *plVar16 = (long)(puVar34 + 0x10);
                  *(undefined4 *)(plVar16 + 1) = 1;
                  plVar16[6] = 0;
                  __cxa_thread_atexit(puVar23,plVar15,&__dso_handle);
                  lVar37 = *plVar15;
                  uVar12 = *(ulong *)(lVar27 + lVar17);
                  iVar26 = *(int *)(lVar37 + 8) + 1;
                  *(int *)(lVar37 + 8) = iVar26;
                  local_e0 = lVar37;
                  if ((uVar12 & 1) == 0) {
                    /* try { // try from 00329e58 to 00329e5b has its CatchHandler @ 0032af00 */
                    plVar16 = operator_new(0x38);
                    lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                    puVar34 = PTR_vtable_004dee18;
                    *(long **)(lVar27 + lVar17) = plVar16;
                    lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                    plVar16[6] = 0;
                    *(undefined8 *)(lVar27 + lVar17) = 1;
                    puVar23 = PTR__Lazy_004de878;
                    *plVar16 = (long)(puVar34 + 0x10);
                    *(undefined4 *)(plVar16 + 1) = 1;
                    __cxa_thread_atexit(puVar23,plVar15,&__dso_handle);
                    lVar37 = *plVar15;
                    iVar26 = *(int *)(lVar37 + 8);
                  }
                }
                else {
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  lVar37 = *(long *)(lVar27 + lVar17);
                  iVar26 = *(int *)(lVar37 + 8) + 1;
                  *(int *)(lVar37 + 8) = iVar26;
                  local_e0 = lVar37;
                }
                auVar63 = (*(code *)PTR_004e2f60)(&PTR_004e2f60,iVar26);
                *(int *)(lVar37 + 8) = auVar63._8_4_ + 1;
                local_b0 = &local_330;
                local_2c0 = PTR_vtable_004defd8 + 0x10;
                local_cf = 0x100;
                local_c8 = 0;
                uStack_c0 = 0;
                local_b8 = 0;
                local_90 = 0;
                local_a8 = &local_a8;
                uStack_98 = 0;
                local_88 = 4;
                local_80 = 0;
                local_78 = 0x3f800000;
                local_70 = 0;
                local_68 = (void *)0x0;
                local_60 = (void *)0x0;
                local_58 = (void *)0x0;
                local_50 = 0;
                local_328 = (No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                             *)&local_2c0;
                local_d8 = lVar37;
                local_a0 = local_a8;
                if ((*(ulong *)(lVar27 + auVar63._0_8_) & 1) == 0) {
                    /* try { // try from 0032a204 to 0032a207 has its CatchHandler @ 0032b1a0 */
                  plVar15 = operator_new(0x48);
                  ppuVar33 = &PTR_EscapePrecFlag_004de000;
                  ppuVar39 = &PTR_EscapePrecFlag_004de000;
                  lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                  puVar34 = ppuVar33[0x1bd];
                  *(long **)(lVar27 + lVar17) = plVar15;
                  auVar62 = (*(code *)PTR_004e2f60)(&PTR_004e2f60,lVar27 + lVar17);
                  *(undefined8 *)(lVar27 + auVar62._0_8_) = 1;
                  puVar23 = ppuVar39[0xef];
                  *plVar15 = (long)(puVar34 + 0x10);
                  *(undefined4 *)(plVar15 + 1) = 1;
                  plVar15[8] = 0;
                  __cxa_thread_atexit(puVar23,auVar62._8_8_,&__dso_handle);
                }
                lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                auVar62 = (*(code *)PTR_004e3200)(&PTR_004e3200,*(undefined8 *)(lVar27 + lVar17));
                local_48 = auVar62._8_8_;
                uVar12 = *(ulong *)(lVar27 + auVar62._0_8_);
                *(int *)(local_48 + 1) = (int)local_48[1] + 1;
                if ((uVar12 & 1) == 0) {
                    /* try { // try from 0032a10c to 0032a10f has its CatchHandler @ 0032ac4c */
                  plVar15 = operator_new(0x38);
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  puVar34 = PTR_vtable_004dee18;
                  puVar4 = (undefined8 *)(lVar27 + lVar17);
                  *(long **)(lVar27 + lVar17) = plVar15;
                  lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                  *(undefined8 *)(lVar27 + lVar17) = 1;
                  puVar23 = PTR__Lazy_004de878;
                  *plVar15 = (long)(puVar34 + 0x10);
                  *(undefined4 *)(plVar15 + 1) = 1;
                  plVar15[6] = 0;
                  __cxa_thread_atexit(puVar23,puVar4,&__dso_handle);
                  plVar15 = (long *)*puVar4;
                  uVar12 = *(ulong *)(lVar27 + lVar17);
                  iVar26 = (int)plVar15[1] + 1;
                  *(int *)(plVar15 + 1) = iVar26;
                  local_40 = plVar15;
                  if ((uVar12 & 1) == 0) {
                    /* try { // try from 0032a19c to 0032a19f has its CatchHandler @ 0032afdc */
                    plVar15 = operator_new(0x38);
                    lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                    puVar34 = PTR_vtable_004dee18;
                    *(long **)(lVar27 + lVar17) = plVar15;
                    lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                    plVar15[6] = 0;
                    *(undefined8 *)(lVar27 + lVar17) = 1;
                    puVar23 = PTR__Lazy_004de878;
                    *plVar15 = (long)(puVar34 + 0x10);
                    *(undefined4 *)(plVar15 + 1) = 1;
                    __cxa_thread_atexit(puVar23,puVar4,&__dso_handle);
                    plVar15 = (long *)*puVar4;
                    iVar26 = (int)plVar15[1];
                  }
                }
                else {
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  plVar15 = *(long **)(lVar27 + lVar17);
                  iVar26 = (int)plVar15[1] + 1;
                  *(int *)(plVar15 + 1) = iVar26;
                  local_40 = plVar15;
                }
                *(int *)(plVar15 + 1) = iVar26 + 1;
                puVar30 = (undefined1 *)register0x00000008;
                local_38 = plVar15;
                lVar17 = (*(code *)PTR_004e2f60)(&PTR_004e2f60);
                uVar12 = *(ulong *)(lVar27 + lVar17);
                *(undefined2 *)(puVar30 + -0x2f) = 0x100;
                if ((uVar12 & 1) == 0) {
                    /* try { // try from 0032a09c to 0032a09f has its CatchHandler @ 0032ae80 */
                  plVar15 = operator_new(0x48);
                  ppuVar33 = &PTR_EscapePrecFlag_004de000;
                  ppuVar39 = &PTR_EscapePrecFlag_004de000;
                  lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                  puVar34 = ppuVar33[0x1bd];
                  *(long **)(lVar27 + lVar17) = plVar15;
                  auVar62 = (*(code *)PTR_004e2f60)(&PTR_004e2f60,lVar27 + lVar17);
                  *(undefined8 *)(lVar27 + auVar62._0_8_) = 1;
                  puVar23 = ppuVar39[0xef];
                  *plVar15 = (long)(puVar34 + 0x10);
                  *(undefined4 *)(plVar15 + 1) = 1;
                  plVar15[8] = 0;
                  __cxa_thread_atexit(puVar23,auVar62._8_8_,&__dso_handle);
                }
                lVar17 = (*(code *)PTR_004e3240)(&PTR_004e3240);
                auVar62 = (*(code *)PTR_004e3200)(&PTR_004e3200,*(undefined8 *)(lVar27 + lVar17));
                local_28 = auVar62._8_8_;
                uVar12 = *(ulong *)(lVar27 + auVar62._0_8_);
                *(int *)(local_28 + 1) = (int)local_28[1] + 1;
                if ((uVar12 & 1) == 0) {
                    /* try { // try from 00329fa0 to 00329fa3 has its CatchHandler @ 0032aee4 */
                  plVar15 = operator_new(0x38);
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  puVar34 = PTR_vtable_004dee18;
                  puVar4 = (undefined8 *)(lVar27 + lVar17);
                  *(long **)(lVar27 + lVar17) = plVar15;
                  lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                  *(undefined8 *)(lVar27 + lVar17) = 1;
                  puVar23 = PTR__Lazy_004de878;
                  *plVar15 = (long)(puVar34 + 0x10);
                  *(undefined4 *)(plVar15 + 1) = 1;
                  plVar15[6] = 0;
                  __cxa_thread_atexit(puVar23,puVar4,&__dso_handle);
                  plVar15 = (long *)*puVar4;
                  uVar12 = *(ulong *)(lVar27 + lVar17);
                  iVar26 = (int)plVar15[1] + 1;
                  *(int *)(plVar15 + 1) = iVar26;
                  local_20 = plVar15;
                  if ((uVar12 & 1) == 0) {
                    /* try { // try from 0032a030 to 0032a033 has its CatchHandler @ 0032ae90 */
                    plVar15 = operator_new(0x38);
                    lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                    puVar34 = PTR_vtable_004dee18;
                    *(long **)(lVar27 + lVar17) = plVar15;
                    lVar17 = (*(code *)PTR_004e3200)(&PTR_004e3200);
                    *(undefined8 *)(lVar27 + lVar17) = 1;
                    puVar23 = PTR__Lazy_004de878;
                    *plVar15 = (long)(puVar34 + 0x10);
                    *(undefined4 *)(plVar15 + 1) = 1;
                    plVar15[6] = 0;
                    __cxa_thread_atexit(puVar23,puVar4,&__dso_handle);
                    plVar15 = (long *)*puVar4;
                    iVar26 = (int)plVar15[1];
                  }
                }
                else {
                  lVar17 = (*(code *)PTR_004e3100)(&PTR_004e3100);
                  plVar15 = *(long **)(lVar27 + lVar17);
                  iVar26 = (int)plVar15[1] + 1;
                  *(int *)(plVar15 + 1) = iVar26;
                  local_20 = plVar15;
                }
                *(int *)(plVar15 + 1) = iVar26 + 1;
                local_f = 0x100;
                plStack_378 = (long *)0x0;
                local_380 = (long *)0x0;
                local_370 = (long *)0x0;
                plStack_358 = (long *)0x0;
                local_360 = (long *)0x0;
                local_350 = 0;
                local_18 = plVar15;
                    /* try { // try from 00329250 to 00329a7b has its CatchHandler @ 0032af5c */
                plVar18 = operator_new(0x40);
                plVar20 = plStack_378;
                plVar16 = plStack_378;
                for (plVar15 = local_380; plVar15 != plVar20; plVar15 = plVar15 + 4) {
                  plVar16 = (long *)plVar15[2];
                  if ((plVar16 != (long *)0x0) &&
                     (iVar26 = (int)plVar16[1] + -1, *(int *)(plVar16 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar16 + 8))();
                  }
                  plVar16 = (long *)plVar15[1];
                  if ((plVar16 != (long *)0x0) &&
                     (iVar26 = (int)plVar16[1] + -1, *(int *)(plVar16 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar16 + 8))();
                  }
                  plVar16 = (long *)*plVar15;
                  if ((plVar16 != (long *)0x0) &&
                     (iVar26 = (int)plVar16[1] + -1, *(int *)(plVar16 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar16 + 8))();
                  }
                  plVar16 = local_380;
                }
                if (plVar16 != (long *)0x0) {
                  operator_delete(plVar16);
                }
                local_370 = plVar18 + 8;
                local_380 = plVar18;
                plStack_378 = plVar18;
                CGAL::Surface_sweep_2::
                make_x_monotone<CGAL::Arr_segment_traits_2<CGAL::Epeck>,CGAL::Segment_2<CGAL::Epeck>*,std::back_insert_iterator<std::vector<CGAL::Arr_segment_2<CGAL::Epeck>,std::allocator<CGAL::Arr_segment_2<CGAL::Epeck>>>>,std::back_insert_iterator<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
                          (&local_310,&local_300,&local_380,&local_360,
                           *(undefined8 *)(local_328 + 8));
                pNVar10 = local_328;
                plVar18 = plStack_358;
                plVar16 = local_360;
                plVar20 = plStack_378;
                plVar15 = local_380;
                pcVar31 = *(code **)(*(long *)local_328 + 0x10);
                *(int *)(local_328 + 0x208) = (int)((long)plStack_378 - (long)local_380 >> 5);
                (*pcVar31)(local_328);
                if (plVar15 != plVar20) {
                  uVar51 = 0;
                  do {
                    lVar17 = *(long *)(pNVar10 + 0x50);
                    lVar37 = (ulong)uVar51 * 0x48;
                    puVar4 = (undefined8 *)(lVar17 + lVar37);
                    plVar19 = *(long **)(pNVar10 + 0x1d8);
                    uVar55 = *(undefined8 *)(pNVar10 + 0x1c0);
                    uVar57 = *(undefined8 *)(pNVar10 + 0x1c8);
                    lVar27 = plVar19[1];
                    puVar4[2] = *(undefined8 *)(pNVar10 + 0x1d0);
                    puVar4[3] = plVar19;
                    *puVar4 = uVar55;
                    puVar4[1] = uVar57;
                    plVar32 = *(long **)(pNVar10 + 0x1e0);
                    *(int *)(plVar19 + 1) = (int)lVar27 + 1;
                    puVar4[4] = plVar32;
                    lVar27 = *(long *)(pNVar10 + 0x1e8);
                    uVar57 = *(undefined8 *)(pNVar10 + 0x200);
                    uVar55 = *(undefined8 *)(pNVar10 + 0x1f8);
                    *(int *)(plVar32 + 1) = (int)plVar32[1] + 1;
                    puVar4[5] = lVar27;
                    *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
                    lVar27 = *plVar15;
                    *(undefined2 *)(puVar4 + 6) = *(undefined2 *)(pNVar10 + 0x1f0);
                    *(No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                      *)((long)puVar4 + 0x32) = pNVar10[0x1f2];
                    iVar26 = *(int *)(lVar27 + 8);
                    puVar4[8] = uVar57;
                    puVar4[7] = uVar55;
                    *(No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                      **)(lVar17 + lVar37) = pNVar10 + 0xb8;
                    *(int *)(lVar27 + 8) = iVar26 + 1;
                    iVar26 = (int)plVar19[1] + -1;
                    *(int *)(plVar19 + 1) = iVar26;
                    if (iVar26 == 0) {
                      (**(code **)(*plVar19 + 8))();
                      puVar4[3] = *plVar15;
                      plVar32 = (long *)puVar4[4];
                      lVar27 = plVar15[1];
                      *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
                      if (plVar32 != (long *)0x0) goto LAB_00329548;
                    }
                    else {
                      puVar4[3] = lVar27;
                      lVar27 = plVar15[1];
                      *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
LAB_00329548:
                      iVar26 = (int)plVar32[1] + -1;
                      *(int *)(plVar32 + 1) = iVar26;
                      if (iVar26 == 0) {
                        (**(code **)(*plVar32 + 8))(plVar32);
                        lVar27 = plVar15[1];
                      }
                    }
                    puVar4[4] = lVar27;
                    plVar19 = (long *)puVar4[5];
                    lVar27 = plVar15[2];
                    *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
                    if ((plVar19 != (long *)0x0) &&
                       (iVar26 = (int)plVar19[1] + -1, *(int *)(plVar19 + 1) = iVar26, iVar26 == 0))
                    {
                      (**(code **)(*plVar19 + 8))();
                      lVar27 = plVar15[2];
                    }
                    lVar17 = plVar15[3];
                    lVar38 = *(long *)(pNVar10 + 0x50);
                    puVar4[5] = lVar27;
                    *(char *)(puVar4 + 6) = (char)lVar17;
                    *(undefined1 *)((long)puVar4 + 0x31) = *(undefined1 *)((long)plVar15 + 0x19);
                    *(undefined1 *)((long)puVar4 + 0x32) = *(undefined1 *)((long)plVar15 + 0x1a);
                    plVar19 = plVar15 + 2;
                    if ((char)plVar15[3] == '\0') {
                      plVar19 = plVar15 + 1;
                    }
                    CGAL::Surface_sweep_2::
                    No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                    ::_push_event(pNVar10,plVar19,2,4,4,lVar38 + lVar37);
                    plVar19 = plVar15 + 1;
                    if ((char)plVar15[3] == '\0') {
                      plVar19 = plVar15 + 2;
                    }
                    CGAL::Surface_sweep_2::
                    No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                    ::_push_event(pNVar10,plVar19,1,4,4,*(long *)(pNVar10 + 0x50) + lVar37);
                    plVar15 = plVar15 + 4;
                    uVar51 = uVar51 + 1;
                  } while (plVar20 != plVar15);
                }
                for (; plVar16 != plVar18; plVar16 = plVar16 + 1) {
                  CGAL::Surface_sweep_2::
                  No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                  ::_push_event(pNVar10,plVar16,4,4,4,0);
                }
                pNVar45 = *(Node **)(*(long *)(pNVar10 + 0x48) + 0x50);
                if ((pNVar45 != (Node *)0x0) &&
                   (pNVar45 != (Node *)(*(long *)(pNVar10 + 0x48) + 0x68))) {
                  do {
                    pcVar31 = *(code **)(*(long *)pNVar10 + 0x20);
                    *(undefined8 *)(pNVar10 + 0x18) = *(undefined8 *)pNVar45;
                    (*pcVar31)(pNVar10);
                    (**(code **)(*(long *)pNVar10 + 0x28))(pNVar10);
                    pDVar47 = *(Default_event **)(pNVar10 + 0x18);
                    if (((*(char *)(*(long *)(pNVar10 + 0x210) + 0x18) != '\0') ||
                        (((byte)pDVar47[0x38] & 0x30) != 0)) &&
                       (pDVar47[0x3b] != (Default_event)0x0)) {
                      lVar17 = *(long *)(*(long *)(pNVar10 + 0x210) + 0x10);
                      p_Var25 = operator_new(0x18);
                      lVar27 = *(long *)pDVar47;
                      *(long *)(p_Var25 + 0x10) = lVar27;
                      *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
                      std::__detail::_List_node_base::_M_hook(p_Var25);
                      pDVar47 = *(Default_event **)(pNVar10 + 0x18);
                      *(long *)(lVar17 + 0x10) = *(long *)(lVar17 + 0x10) + 1;
                    }
                    local_388 = pDVar47;
                    CGAL::
                    Multiset<CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>*,CGAL::Surface_sweep_2::No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>::CompEventPtr,std::allocator<int>>
                    ::erase((Multiset<CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>*,CGAL::Surface_sweep_2::No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>::CompEventPtr,std::allocator<int>>
                             *)(pNVar10 + 0xe0),&local_388);
                    pDVar47 = local_388;
                    if (*(void **)(local_388 + 0x40) != (void *)0x0) {
                      operator_delete(*(void **)(local_388 + 0x40));
                    }
                    pDVar6 = *(Default_event **)(pDVar47 + 0x20);
                    while (pDVar47 + 0x20 != pDVar6) {
                      pDVar54 = *(Default_event **)pDVar6;
                      operator_delete(pDVar6);
                      pDVar6 = pDVar54;
                    }
                    pDVar6 = *(Default_event **)(pDVar47 + 8);
                    while (pDVar6 != pDVar47 + 8) {
                      pDVar54 = *(Default_event **)pDVar6;
                      operator_delete(pDVar6);
                      pDVar6 = pDVar54;
                    }
                    plVar15 = *(long **)pDVar47;
                    if ((plVar15 != (long *)0x0) &&
                       (iVar26 = (int)plVar15[1] + -1, *(int *)(plVar15 + 1) = iVar26, iVar26 == 0))
                    {
                      (**(code **)(*plVar15 + 8))();
                    }
                    operator_delete(local_388);
                    CGAL::
                    Multiset<CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>*,CGAL::Surface_sweep_2::Event_comparer<CGAL::Arr_traits_basic_adaptor_2<CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>>,std::allocator<int>>
                    ::_remove_at(*(Multiset<CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>*,CGAL::Surface_sweep_2::Event_comparer<CGAL::Arr_traits_basic_adaptor_2<CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Surface_sweep_2::Default_event<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::allocator<int>>>,std::allocator<int>>
                                   **)(pNVar10 + 0x48),pNVar45);
                    pNVar45 = *(Node **)(*(long *)(pNVar10 + 0x48) + 0x50);
                  } while ((pNVar45 != (Node *)0x0) &&
                          (pNVar45 != (Node *)(*(long *)(pNVar10 + 0x48) + 0x68)));
                }
                (**(code **)(*(long *)pNVar10 + 0x18))(pNVar10);
                plVar20 = plStack_358;
                plVar16 = plStack_358;
                for (plVar15 = local_360; plVar15 != plVar20; plVar15 = plVar15 + 1) {
                  plVar16 = (long *)*plVar15;
                  if ((plVar16 != (long *)0x0) &&
                     (iVar26 = (int)plVar16[1] + -1, *(int *)(plVar16 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar16 + 8))();
                  }
                  plVar16 = local_360;
                }
                plVar15 = local_380;
                plVar20 = plStack_378;
                plVar18 = plStack_378;
                if (plVar16 != (long *)0x0) {
                  operator_delete(plVar16);
                  plVar15 = local_380;
                  plVar20 = plStack_378;
                  plVar18 = plStack_378;
                }
                for (; plVar16 = plStack_378, plVar15 != plStack_378; plVar15 = plVar15 + 4) {
                  plVar20 = (long *)plVar15[2];
                  plStack_378 = plVar18;
                  if ((plVar20 != (long *)0x0) &&
                     (iVar26 = (int)plVar20[1] + -1, *(int *)(plVar20 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar20 + 8))();
                  }
                  plVar20 = (long *)plVar15[1];
                  if ((plVar20 != (long *)0x0) &&
                     (iVar26 = (int)plVar20[1] + -1, *(int *)(plVar20 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar20 + 8))();
                  }
                  plVar20 = (long *)*plVar15;
                  if ((plVar20 != (long *)0x0) &&
                     (iVar26 = (int)plVar20[1] + -1, *(int *)(plVar20 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar20 + 8))();
                  }
                  plVar20 = local_380;
                  plVar18 = plStack_378;
                  plStack_378 = plVar16;
                }
                plStack_378 = plVar18;
                if (plVar20 != (long *)0x0) {
                  operator_delete(plVar20);
                }
                local_2c0 = PTR_vtable_004defd8 + 0x10;
                if ((local_18 != (long *)0x0) &&
                   (iVar26 = (int)local_18[1] + -1, *(int *)(local_18 + 1) = iVar26, iVar26 == 0)) {
                  (**(code **)(*local_18 + 8))();
                }
                if ((local_20 != (long *)0x0) &&
                   (iVar26 = (int)local_20[1] + -1, *(int *)(local_20 + 1) = iVar26, iVar26 == 0)) {
                  (**(code **)(*local_20 + 8))();
                }
                if ((local_28 != (long *)0x0) &&
                   (iVar26 = (int)local_28[1] + -1, *(int *)(local_28 + 1) = iVar26, iVar26 == 0)) {
                  (**(code **)(*local_28 + 8))();
                }
                if ((local_38 != (long *)0x0) &&
                   (iVar26 = (int)local_38[1] + -1, *(int *)(local_38 + 1) = iVar26, iVar26 == 0)) {
                  (**(code **)(*local_38 + 8))();
                }
                if ((local_40 != (long *)0x0) &&
                   (iVar26 = (int)local_40[1] + -1, *(int *)(local_40 + 1) = iVar26, iVar26 == 0)) {
                  (**(code **)(*local_40 + 8))();
                }
                puVar23 = PTR_destroy_004de358;
                puVar34 = PTR_dispose_004de3f8;
                pvVar28 = local_60;
                pvVar13 = local_58;
                pvVar49 = local_58;
                if ((local_48 != (long *)0x0) &&
                   (iVar26 = (int)local_48[1] + -1, *(int *)(local_48 + 1) = iVar26,
                   puVar23 = PTR_destroy_004de358, puVar34 = PTR_dispose_004de3f8, iVar26 == 0)) {
                  (**(code **)(*local_48 + 8))();
                  puVar23 = PTR_destroy_004de358;
                  puVar34 = PTR_dispose_004de3f8;
                  pvVar28 = local_60;
                  pvVar13 = local_58;
                  pvVar49 = local_58;
                }
joined_r0x003298cc:
                pvVar42 = local_58;
                puVar9 = PTR_dispose_004de3f8;
                puVar8 = PTR_destroy_004de358;
                bVar11 = pvVar28 != local_58;
                PTR_destroy_004de358 = puVar23;
                PTR_dispose_004de3f8 = puVar34;
                local_58 = pvVar49;
                if (bVar11) {
                  do {
                    plVar15 = *(long **)((long)pvVar28 + 8);
                    if (plVar15 != (long *)0x0) {
                      plVar16 = plVar15 + 1;
                      do {
                        lVar27 = *plVar16;
                        cVar5 = '\x01';
                        bVar11 = (bool)ExclusiveMonitorPass(plVar16,0x10);
                        if (bVar11) {
                          *(int *)plVar16 = (int)lVar27 + -1;
                          cVar5 = ExclusiveMonitorsStatus();
                        }
                      } while (cVar5 != '\0');
                      if ((int)lVar27 == 1) {
                        if (*(code **)(*plVar15 + 0x10) == (code *)puVar9) {
                          plVar16 = (long *)plVar15[2];
                          if (plVar16 != (long *)0x0) {
                            if ((long *)*plVar16 != (long *)0x0) {
                              (**(code **)(*(long *)*plVar16 + 8))();
                            }
                            operator_delete(plVar16,8);
                          }
                        }
                        else {
                          (**(code **)(*plVar15 + 0x10))(plVar15);
                        }
                        piVar21 = (int *)((long)plVar15 + 0xc);
                        do {
                          iVar26 = *piVar21;
                          cVar5 = '\x01';
                          bVar11 = (bool)ExclusiveMonitorPass(piVar21,0x10);
                          if (bVar11) {
                            *piVar21 = iVar26 + -1;
                            cVar5 = ExclusiveMonitorsStatus();
                          }
                        } while (cVar5 != '\0');
                        if (iVar26 == 1) {
                          pcVar31 = *(code **)(*plVar15 + 0x18);
                          if (pcVar31 == (code *)puVar8) goto code_r0x00329978;
                          (*pcVar31)(plVar15);
                        }
                      }
                    }
                    pvVar28 = (void *)((long)pvVar28 + 0x10);
                    pvVar13 = local_60;
                    if (pvVar42 == pvVar28) break;
                  } while( true );
                }
                if (pvVar13 != (void *)0x0) {
                  operator_delete(pvVar13);
                }
                if (local_68 != (void *)0x0) {
                  puVar4 = *(void **)((long)local_68 + local_88 * 8);
                  while (puVar4 != (void *)0x0) {
                    pvVar28 = (void *)*puVar4;
                    operator_delete(puVar4);
                    puVar4 = pvVar28;
                  }
                  operator_delete(local_68);
                }
                pppppppuVar7 = local_a8;
                while ((undefined8 ********)pppppppuVar7 != &local_a8) {
                  pppppppuVar46 = (undefined8 *******)*pppppppuVar7;
                  operator_delete(pppppppuVar7);
                  pppppppuVar7 = pppppppuVar46;
                }
                CGAL::Surface_sweep_2::
                No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                ::~No_intersection_surface_sweep_2
                          ((No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
                            *)&local_2c0);
                lVar27 = 2;
                plVar15 = &local_300;
                while( true ) {
                  plVar15 = plVar15 + -1;
                  plVar16 = (long *)*plVar15;
                  if ((plVar16 != (long *)0x0) &&
                     (iVar26 = (int)plVar16[1] + -1, *(int *)(plVar16 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar16 + 8))();
                  }
                  if (lVar27 == 1) break;
                  lVar27 = 1;
                }
                lVar27 = *(long *)param_1;
                lVar17 = *(long *)param_2 + lVar40;
                lVar37 = *(long *)(lVar17 + 0x18);
                lVar38 = *(long *)(lVar17 + 0x30);
                lVar29 = lVar37 - *(long *)(lVar17 + 0x20);
                uVar12 = local_438 + (lVar29 >> 2);
                local_448 = plVar36;
                if (-1 < (long)uVar12) goto LAB_00328ba8;
LAB_00329a64:
                uVar41 = ~(~uVar12 >> 7);
LAB_00329ad0:
                if (*(long **)(lVar27 + (long)*(int *)(*(long *)(lVar38 + uVar41 * 8) +
                                                      (uVar12 + uVar41 * -0x80) * 4) * 0x20 + 8) ==
                    local_448) break;
              } while( true );
            }
            puVar2 = PTR_vtable_004deb50;
            local_430 = plVar50;
          } while ((long *)((undefined8 *)(lVar27 + lVar35))[1] != plVar50);
          plVar53 = *(long **)(lVar27 + lVar35);
          if (plVar50 != plVar53) {
            lVar29 = lVar37 - *(long *)(lVar17 + 0x20);
            do {
              uVar12 = local_438 + (lVar29 >> 2);
              if ((long)uVar12 < 0) {
                uVar41 = ~(~uVar12 >> 7);
LAB_0032a8c4:
                piVar21 = (int *)(*(long *)(lVar38 + uVar41 * 8) + (uVar12 + uVar41 * -0x80) * 4);
              }
              else {
                if (0x7f < (long)uVar12) {
                  uVar41 = (long)uVar12 >> 7;
                  goto LAB_0032a8c4;
                }
                piVar21 = (int *)(lVar37 + lVar14);
              }
              plVar50 = *(long **)(lVar27 + (long)*piVar21 * 0x20);
              uVar12 = local_438 + (lVar29 >> 2);
              if ((long)uVar12 < 0) goto LAB_00329d70;
              while( true ) {
                if (0x7f < (long)uVar12) {
                  uVar41 = (long)uVar12 >> 7;
                  goto LAB_0032a298;
                }
                if (*(long **)(lVar27 + (long)*(int *)(lVar37 + lVar14) * 0x20 + 8) == plVar50)
                break;
                while( true ) {
                  uVar55 = fpcr;
                  fpcr = 0x400000;
                    /* try { // try from 00329b94 to 00329b97 has its CatchHandler @ 0032af8c */
                  plVar22 = operator_new(0x30);
                  lVar37 = *plVar53;
                  lVar27 = *(long *)(lVar37 + 0x10);
                  lVar17 = *(long *)(lVar37 + 0x18);
                  *(undefined4 *)(plVar22 + 1) = 1;
                  plVar22[4] = 0;
                  plVar22[5] = lVar37;
                  iVar26 = *(int *)(lVar37 + 8);
                  *plVar22 = (long)(puVar2 + 0x10);
                  plVar22[2] = lVar27;
                  plVar22[3] = lVar17;
                  *(int *)(lVar37 + 8) = iVar26 + 1;
                  fpcr = uVar55;
                  dVar58 = (double)plVar22[2];
                  dVar56 = (double)plVar22[3];
                  dVar61 = -dVar58;
                  if (dVar56 != dVar61) {
                    dVar61 = ABS(dVar56);
                    if (ABS(dVar56) <= ABS(dVar58)) {
                      dVar61 = ABS(dVar58);
                    }
                    if (dVar61 != 0.0) {
                      uVar55 = tpidr_el0;
                      dVar59 = dVar56 + dVar58;
                      lVar27 = (*(code *)PTR_004e30a0)(&PTR_004e30a0,uVar55);
                      dVar56 = extraout_d0_00;
                      if ((dVar61 * *(double *)(extraout_x1 + lVar27) <= dVar59 * 0.5) &&
                         (plVar22[4] == 0)) {
                    /* try { // try from 0032a888 to 0032a88b has its CatchHandler @ 0032aa40 */
                        (**(code **)(*plVar22 + 0x10))(plVar22);
                        dVar58 = (double)plVar22[2];
                        dVar56 = (double)plVar22[3];
                      }
                    }
                    dVar61 = (dVar56 - dVar58) * 0.5;
                  }
                  uVar55 = fpcr;
                  fpcr = 0x400000;
                    /* try { // try from 00329c44 to 00329c47 has its CatchHandler @ 0032adfc */
                  plVar36 = operator_new(0x30);
                  lVar37 = *plVar50;
                  lVar27 = *(long *)(lVar37 + 0x10);
                  lVar17 = *(long *)(lVar37 + 0x18);
                  *(undefined4 *)(plVar36 + 1) = 1;
                  plVar36[4] = 0;
                  plVar36[5] = lVar37;
                  iVar26 = *(int *)(lVar37 + 8);
                  *plVar36 = (long)puVar1;
                  plVar36[2] = lVar27;
                  plVar36[3] = lVar17;
                  *(int *)(lVar37 + 8) = iVar26 + 1;
                  fpcr = uVar55;
                  dVar59 = (double)plVar36[2];
                  dVar56 = (double)plVar36[3];
                  dVar58 = -dVar59;
                  if (dVar56 != dVar58) {
                    dVar58 = ABS(dVar56);
                    if (ABS(dVar56) <= ABS(dVar59)) {
                      dVar58 = ABS(dVar59);
                    }
                    if (dVar58 != 0.0) {
                      uVar55 = tpidr_el0;
                      dVar60 = dVar56 + dVar59;
                      lVar27 = (*(code *)PTR_004e30a0)(&PTR_004e30a0,uVar55);
                      dVar56 = extraout_d0_01;
                      if ((dVar58 * *(double *)(extraout_x1_00 + lVar27) <= dVar60 * 0.5) &&
                         (plVar36[4] == 0)) {
                    /* try { // try from 0032a8a0 to 0032a8a3 has its CatchHandler @ 0032ac40 */
                        (**(code **)(*plVar36 + 0x10))(plVar36);
                        dVar59 = (double)plVar36[2];
                        dVar56 = (double)plVar36[3];
                      }
                    }
                    dVar58 = (dVar56 - dVar59) * 0.5;
                  }
                  bVar11 = false;
                  if (dVar61 == dVar58) {
                    uVar55 = fpcr;
                    fpcr = 0x400000;
                    /* try { // try from 0032a680 to 0032a683 has its CatchHandler @ 0032adc4 */
                    plVar15 = operator_new(0x30);
                    puVar23 = PTR_vtable_004dec80;
                    lVar37 = *plVar53;
                    lVar27 = *(long *)(lVar37 + 0x20);
                    lVar17 = *(long *)(lVar37 + 0x28);
                    *(undefined4 *)(plVar15 + 1) = 1;
                    plVar15[5] = lVar37;
                    iVar26 = *(int *)(lVar37 + 8);
                    *plVar15 = (long)(puVar23 + 0x10);
                    plVar15[2] = lVar27;
                    plVar15[3] = lVar17;
                    plVar15[4] = 0;
                    *(int *)(lVar37 + 8) = iVar26 + 1;
                    fpcr = uVar55;
                    dVar58 = (double)plVar15[2];
                    dVar56 = (double)plVar15[3];
                    dVar61 = -dVar58;
                    if (dVar56 != dVar61) {
                      dVar61 = ABS(dVar56);
                      if (ABS(dVar56) <= ABS(dVar58)) {
                        dVar61 = ABS(dVar58);
                      }
                      if (dVar61 != 0.0) {
                        uVar55 = tpidr_el0;
                        dVar59 = dVar56 + dVar58;
                        lVar27 = (*(code *)PTR_004e30a0)(&PTR_004e30a0,uVar55);
                        dVar56 = extraout_d0_02;
                        if ((dVar61 * *(double *)(extraout_x1_01 + lVar27) <= dVar59 * 0.5) &&
                           (plVar15[4] == 0)) {
                    /* try { // try from 0032a8f8 to 0032a8fb has its CatchHandler @ 0032ac34 */
                          (**(code **)(*plVar15 + 0x10))(plVar15);
                          dVar58 = (double)plVar15[2];
                          dVar56 = (double)plVar15[3];
                        }
                      }
                      dVar61 = (dVar56 - dVar58) * 0.5;
                    }
                    uVar55 = fpcr;
                    fpcr = 0x400000;
                    /* try { // try from 0032a740 to 0032a743 has its CatchHandler @ 0032ad88 */
                    plVar16 = operator_new(0x30);
                    puVar23 = PTR_vtable_004dec80;
                    lVar37 = *plVar50;
                    lVar27 = *(long *)(lVar37 + 0x20);
                    lVar17 = *(long *)(lVar37 + 0x28);
                    *(undefined4 *)(plVar16 + 1) = 1;
                    plVar16[5] = lVar37;
                    iVar26 = *(int *)(lVar37 + 8);
                    *plVar16 = (long)(puVar23 + 0x10);
                    plVar16[2] = lVar27;
                    plVar16[3] = lVar17;
                    plVar16[4] = 0;
                    *(int *)(lVar37 + 8) = iVar26 + 1;
                    fpcr = uVar55;
                    dVar59 = (double)plVar16[2];
                    dVar58 = (double)plVar16[3];
                    dVar56 = -dVar59;
                    if (dVar58 != dVar56) {
                      dVar56 = ABS(dVar58);
                      if (ABS(dVar58) <= ABS(dVar59)) {
                        dVar56 = ABS(dVar59);
                      }
                      if (dVar56 != 0.0) {
                        uVar55 = tpidr_el0;
                        dVar56 = dVar58 + dVar59;
                        lVar27 = (*(code *)PTR_004e30a0)(&PTR_004e30a0,uVar55);
                        if ((extraout_d0_03 * *(double *)(extraout_x1_02 + lVar27) <= dVar56 * 0.5)
                           && (plVar16[4] == 0)) {
                    /* try { // try from 0032a910 to 0032a913 has its CatchHandler @ 0032abc0 */
                          (**(code **)(*plVar16 + 0x10))(plVar16);
                          dVar59 = (double)plVar16[2];
                          dVar58 = (double)plVar16[3];
                        }
                      }
                      dVar56 = (dVar58 - dVar59) * 0.5;
                    }
                    bVar11 = dVar61 == dVar56;
                    iVar26 = (int)plVar16[1] + -1;
                    *(int *)(plVar16 + 1) = iVar26;
                    if (iVar26 == 0) {
                      (**(code **)(*plVar16 + 8))(plVar16);
                    }
                    iVar26 = (int)plVar15[1] + -1;
                    *(int *)(plVar15 + 1) = iVar26;
                    if (iVar26 == 0) {
                      (**(code **)(*plVar15 + 8))(plVar15);
                    }
                  }
                  iVar26 = (int)plVar36[1] + -1;
                  *(int *)(plVar36 + 1) = iVar26;
                  if (iVar26 == 0) {
                    (**(code **)(*plVar36 + 8))(plVar36);
                  }
                  iVar26 = (int)plVar22[1] + -1;
                  *(int *)(plVar22 + 1) = iVar26;
                  if (iVar26 == 0) {
                    (**(code **)(*plVar22 + 8))(plVar22);
                  }
                  if (bVar11) {
                    /* try { // try from 0032a840 to 0032a843 has its CatchHandler @ 0032ad80 */
                    p_Var25 = operator_new(0x18);
                    lVar27 = *plVar53;
                    *(long *)(p_Var25 + 0x10) = lVar27;
                    *(int *)(lVar27 + 8) = *(int *)(lVar27 + 8) + 1;
                    std::__detail::_List_node_base::_M_hook(p_Var25);
                    local_338 = local_338 + 1;
                  }
                  plVar50 = plVar50 + 1;
                  lVar17 = *(long *)param_2 + lVar40;
                  lVar37 = *(long *)(lVar17 + 0x18);
                  lVar38 = *(long *)(lVar17 + 0x30);
                  lVar29 = lVar37 - *(long *)(lVar17 + 0x20);
                  lVar27 = *(long *)param_1;
                  uVar12 = local_438 + (lVar29 >> 2);
                  if (-1 < (long)uVar12) break;
LAB_00329d70:
                  uVar41 = ~(~uVar12 >> 7);
LAB_0032a298:
                  if (*(long **)(lVar27 + (long)*(int *)(*(long *)(lVar38 + uVar41 * 8) +
                                                        (uVar12 + uVar41 * -0x80) * 4) * 0x20 + 8)
                      == plVar50) goto LAB_0032a2b8;
                }
              }
LAB_0032a2b8:
              plVar53 = plVar53 + 1;
            } while (*(long **)(lVar27 + lVar35 + 8) != plVar53);
          }
        }
        if (local_348 !=
            (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
            &local_348) {
          p_Var43 = local_348;
          p_Var52 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                      **)local_348;
          p_Var44 = local_348 + 0x10;
          if (*(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> **
               )local_348 ==
              (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
              &local_348) goto LAB_0032a950;
          do {
            lVar27 = *(long *)(p_Var43 + 0x10);
            pPVar3 = (Point_2 *)(p_Var52 + 0x10);
            dVar56 = *(double *)(lVar27 + 0x10);
            if ((*(double *)(lVar27 + 0x18) == -dVar56) &&
               (*(double *)(lVar27 + 0x28) == -*(double *)(lVar27 + 0x20))) {
              lVar17 = *(long *)(p_Var52 + 0x10);
              dVar58 = *(double *)(lVar17 + 0x10);
              if ((*(double *)(lVar17 + 0x18) != -dVar58) ||
                 (*(double *)(lVar17 + 0x28) != -*(double *)(lVar17 + 0x20))) goto LAB_0032a2f8;
              bVar11 = false;
              if ((*(double *)(lVar27 + 0x20) == *(double *)(lVar17 + 0x20)) &&
                 (bVar11 = false, !NAN(dVar56) && !NAN(dVar58))) {
                bVar11 = dVar56 == dVar58;
              }
              if (bVar11) goto LAB_0032a384;
            }
            else {
LAB_0032a2f8:
                    /* try { // try from 0032a304 to 0032a3b3 has its CatchHandler @ 0032ad80 */
              bVar11 = CGAL::
                       Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                       ::operator()((Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                     *)&local_330,(Point_2 *)p_Var44,pPVar3);
              if (bVar11) {
LAB_0032a384:
                if (p_Var43 !=
                    (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                     *)&local_348) {
                  p_Var48 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              **)p_Var43;
                  p_Var52 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              **)p_Var48;
                  if (p_Var52 !=
                      (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_348) goto LAB_0032a3d0;
                  goto LAB_0032a47c;
                }
                break;
              }
            }
            p_Var48 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                        **)p_Var52;
            p_Var43 = p_Var52;
            p_Var52 = p_Var48;
            p_Var44 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)pPVar3;
          } while (p_Var48 !=
                   (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                    *)&local_348);
          goto LAB_0032a4d8;
        }
LAB_0032a950:
        lVar17 = lVar17 + 0x18;
        goto LAB_0032a4f4;
      }
      local_3a8 = local_3a8 + 1;
    } while (local_3a8 < (undefined *)((*(long *)(param_2 + 8) - lVar27 >> 5) * -0x5555555555555555)
            );
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(PTR___stack_chk_guard_004de1a8,
                     local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return in_x8;
code_r0x00329978:
  (**(code **)(*plVar15 + 8))(plVar15);
  puVar23 = PTR_destroy_004de358;
  puVar34 = PTR_dispose_004de3f8;
  pvVar28 = (void *)((long)pvVar28 + 0x10);
  pvVar13 = local_60;
  pvVar49 = local_58;
  local_58 = pvVar42;
  PTR_dispose_004de3f8 = puVar9;
  PTR_destroy_004de358 = puVar8;
  goto joined_r0x003298cc;
LAB_0032a3d0:
  lVar27 = *(long *)(p_Var43 + 0x10);
  pPVar3 = (Point_2 *)(p_Var52 + 0x10);
  dVar56 = *(double *)(lVar27 + 0x10);
  if ((*(double *)(lVar27 + 0x18) == -dVar56) &&
     (*(double *)(lVar27 + 0x28) == -*(double *)(lVar27 + 0x20))) {
    lVar17 = *(long *)(p_Var52 + 0x10);
    dVar58 = *(double *)(lVar17 + 0x10);
    if ((*(double *)(lVar17 + 0x18) != -dVar58) ||
       (*(double *)(lVar17 + 0x28) != -*(double *)(lVar17 + 0x20))) goto LAB_0032a3a4;
    bVar11 = false;
    if ((*(double *)(lVar27 + 0x20) == *(double *)(lVar17 + 0x20)) &&
       (bVar11 = false, !NAN(dVar56) && !NAN(dVar58))) {
      bVar11 = dVar56 == dVar58;
    }
    if (bVar11) goto LAB_0032a3bc;
LAB_0032a428:
    p_Var43 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> **
               )p_Var43;
    plVar53 = *(long **)(p_Var43 + 0x10);
    *(int *)(lVar17 + 8) = *(int *)(lVar17 + 8) + 1;
    if ((plVar53 != (long *)0x0) &&
       (iVar26 = (int)plVar53[1] + -1, *(int *)(plVar53 + 1) = iVar26, iVar26 == 0)) {
      (**(code **)(*plVar53 + 8))();
      lVar17 = *(long *)pPVar3;
    }
    *(long *)(p_Var43 + 0x10) = lVar17;
    p_Var52 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> **
               )p_Var52;
  }
  else {
LAB_0032a3a4:
    bVar11 = CGAL::
             Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
             ::operator()((Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                           *)&local_330,(Point_2 *)p_Var44,pPVar3);
    if (!bVar11) {
      lVar17 = *(long *)pPVar3;
      goto LAB_0032a428;
    }
LAB_0032a3bc:
    p_Var52 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> **
               )p_Var52;
  }
  if (p_Var52 ==
      (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
      &local_348) goto LAB_0032a478;
  p_Var44 = p_Var43 + 0x10;
  goto LAB_0032a3d0;
LAB_0032a478:
  p_Var48 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> **)
             p_Var43;
LAB_0032a47c:
  if (p_Var48 ==
      (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
      &local_348) {
    lVar27 = *(long *)param_2 + lVar40;
    lVar17 = lVar27 + 0x18;
    lVar37 = *(long *)(lVar27 + 0x18);
    lVar38 = *(long *)(lVar27 + 0x30);
  }
  else {
    do {
      local_338 = local_338 + -1;
      p_Var44 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  **)p_Var48;
      std::__detail::_List_node_base::_M_unhook();
      plVar53 = *(long **)(p_Var48 + 0x10);
      if ((plVar53 != (long *)0x0) &&
         (iVar26 = (int)plVar53[1] + -1, *(int *)(plVar53 + 1) = iVar26, iVar26 == 0)) {
        (**(code **)(*plVar53 + 8))();
      }
      operator_delete(p_Var48);
      p_Var48 = p_Var44;
    } while (p_Var44 !=
             (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
             &local_348);
LAB_0032a4d8:
    lVar27 = *(long *)param_2 + lVar40;
    lVar17 = lVar27 + 0x18;
    lVar37 = *(long *)(lVar27 + 0x18);
    lVar38 = *(long *)(lVar27 + 0x30);
  }
LAB_0032a4f4:
  lVar27 = *in_x8;
  uVar12 = local_438 + (lVar37 - *(long *)(lVar17 + 8) >> 2);
  if ((long)uVar12 < 0) {
    uVar41 = ~(~uVar12 >> 7);
LAB_0032a940:
    puVar24 = (undefined4 *)(*(long *)(lVar38 + uVar41 * 8) + (uVar12 + uVar41 * -0x80) * 4);
  }
  else {
    if (0x7f < (long)uVar12) {
      uVar41 = (long)uVar12 >> 7;
      goto LAB_0032a940;
    }
    puVar24 = (undefined4 *)(lVar37 + local_438 * 4);
  }
  local_328 = (No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
               *)&local_328;
  local_330 = (undefined *)CONCAT44(local_330._4_4_,*puVar24);
  local_318 = 0;
  local_320 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
              local_328;
  for (p_Var44 = local_348;
      p_Var44 !=
      (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
      &local_348;
      p_Var44 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  **)p_Var44) {
                    /* try { // try from 0032a54c to 0032a54f has its CatchHandler @ 0032aeec */
    p_Var25 = operator_new(0x18);
    lVar17 = *(long *)(p_Var44 + 0x10);
    *(long *)(p_Var25 + 0x10) = lVar17;
    *(int *)(lVar17 + 8) = *(int *)(lVar17 + 8) + 1;
    std::__detail::_List_node_base::_M_hook(p_Var25);
    local_318 = local_318 + 1;
  }
                    /* try { // try from 0032a58c to 0032a58f has its CatchHandler @ 0032ab30 */
  std::
  _Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
  ::
  _M_emplace_unique<std::pair<int,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
            ((_Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              *)(lVar27 + (long)local_3a8 * 0x30),(pair *)&local_330);
  std::__cxx11::_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
  _M_clear((_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
           &local_328);
  lVar27 = *(long *)param_2 + lVar40;
  uVar12 = local_438 + (*(long *)(lVar27 + 0x18) - *(long *)(lVar27 + 0x20) >> 2);
  if ((long)uVar12 < 0) {
    uVar41 = ~(~uVar12 >> 7);
  }
  else {
    if ((long)uVar12 < 0x80) {
      piVar21 = (int *)(*(long *)(lVar27 + 0x18) + local_438 * 4);
      goto LAB_0032a5cc;
    }
    uVar41 = (long)uVar12 >> 7;
  }
  piVar21 = (int *)(*(long *)(*(long *)(lVar27 + 0x30) + uVar41 * 8) + (uVar12 + uVar41 * -0x80) * 4
                   );
LAB_0032a5cc:
  iVar26 = *piVar21;
  local_328 = (No_intersection_surface_sweep_2<CGAL::Surface_sweep_2::Intersection_points_visitor<CGAL::Arr_segment_traits_2<CGAL::Epeck>,std::back_insert_iterator<std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<int>>>
               *)&local_328;
  local_318 = 0;
  lVar27 = *in_x8;
  local_320 = (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
              local_328;
  local_330 = local_3a8;
  for (p_Var44 = local_348;
      p_Var44 !=
      (_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
      &local_348;
      p_Var44 = *(_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  **)p_Var44) {
                    /* try { // try from 0032a604 to 0032a607 has its CatchHandler @ 0032ab2c */
    p_Var25 = operator_new(0x18);
    lVar17 = *(long *)(p_Var44 + 0x10);
    *(long *)(p_Var25 + 0x10) = lVar17;
    *(int *)(lVar17 + 8) = *(int *)(lVar17 + 8) + 1;
    std::__detail::_List_node_base::_M_hook(p_Var25);
    local_318 = local_318 + 1;
  }
                    /* try { // try from 0032a644 to 0032a647 has its CatchHandler @ 0032ab1c */
  std::
  _Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
  ::
  _M_emplace_unique<std::pair<unsigned_long,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
            ((_Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              *)(lVar27 + (long)iVar26 * 0x30),(pair *)&local_330);
  local_438 = local_438 + 1;
  std::__cxx11::_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
  _M_clear((_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
           &local_328);
  std::__cxx11::_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
  _M_clear((_List_base<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
           &local_348);
  lVar27 = *(long *)param_2;
  goto LAB_00328aa0;
}



// ===== calculateDecompositionAdjacency @ 0032b1f0 =====

/* WARNING: Type propagation algorithm not settling */
/* WARNING: Restarted to delay deadcode elimination for space: stack */
/* calculateDecompositionAdjacency(std::vector<CGAL::Polygon_2<CGAL::Epeck,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > >,
   std::allocator<CGAL::Polygon_2<CGAL::Epeck, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > > > > const&) */

long * calculateDecompositionAdjacency(vector *param_1)

{
  undefined *puVar1;
  Polygon_2 *pPVar2;
  Polygon_2 *pPVar3;
  byte bVar4;
  undefined *puVar5;
  Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
  *pAVar6;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *pvVar7;
  undefined8 *puVar8;
  undefined8 *puVar9;
  bool bVar10;
  long lVar11;
  undefined1 *puVar12;
  Arrangement_on_surface_2 *pAVar13;
  long *plVar14;
  void *pvVar15;
  Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
  *pAVar16;
  long *plVar17;
  long *plVar18;
  long *plVar19;
  undefined8 *****pppppuVar20;
  ulong uVar21;
  long *plVar22;
  long *plVar23;
  long *plVar24;
  long *plVar25;
  int iVar26;
  long lVar27;
  long lVar28;
  undefined8 *puVar29;
  code *pcVar30;
  ulong uVar31;
  long lVar32;
  long *in_x8;
  undefined1 *puVar33;
  undefined8 *******pppppppuVar34;
  undefined8 *puVar35;
  undefined8 ******ppppppuVar36;
  long *plVar37;
  undefined8 ******ppppppuVar38;
  long *plVar39;
  undefined8 *******pppppppuVar40;
  undefined8 *puVar41;
  long *plVar42;
  long lVar43;
  long local_380;
  long *local_378;
  long local_310;
  long lStack_308;
  Arrangement_on_surface_2 *local_300;
  long local_2f0;
  long lStack_2e8;
  undefined8 local_2e0;
  undefined auStack_2c8 [8];
  ulong local_2c0;
  ulong local_2b8;
  long local_2b0;
  long lStack_2a8;
  undefined8 local_2a0;
  long local_290;
  long lStack_288;
  undefined8 local_280;
  long local_270;
  long lStack_268;
  undefined8 local_260;
  long local_250;
  long lStack_248;
  undefined8 local_240;
  long local_238;
  long local_230;
  Arrangement_on_surface_2 *local_228;
  long *local_220;
  long *plStack_218;
  undefined8 local_210;
  undefined *local_200;
  undefined *local_1f8;
  char local_1ef;
  Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
  *local_1e8;
  long *local_1e0;
  long *plStack_1d8;
  undefined8 local_1d0;
  void *local_1c0;
  undefined8 local_1b8;
  long *local_1b0;
  undefined8 uStack_1a8;
  long *local_1a0;
  undefined8 *local_198;
  long *local_190;
  long *plStack_188;
  undefined8 uStack_180;
  undefined8 *local_178;
  long *local_170;
  long *plStack_168;
  long local_160;
  void *local_150;
  undefined8 local_148;
  long *local_140;
  undefined8 uStack_138;
  long *local_130;
  undefined8 *local_128;
  long *local_120;
  long *plStack_118;
  undefined8 local_110;
  undefined8 *local_108;
  undefined *local_100;
  undefined *local_f8;
  undefined8 local_f0;
  long *local_e8;
  long *plStack_e0;
  long *local_d8;
  long *plStack_d0;
  long *local_c8;
  undefined8 uStack_c0;
  long *local_b8;
  long lStack_b0;
  undefined8 *******local_a8;
  undefined8 *******local_a0;
  long local_98;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_90;
  undefined8 *local_88;
  long local_80;
  undefined8 *local_70;
  long local_68;
  void *local_58;
  undefined1 local_50;
  long *local_48;
  undefined8 *******local_38;
  undefined8 *******local_30;
  undefined8 local_28;
  void *local_20;
  undefined1 local_18;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  lVar11 = *(long *)(param_1 + 8) - *(long *)param_1;
  uVar21 = lVar11 >> 5;
  if (0x155555555555555 < uVar21) {
                    /* WARNING: Subroutine does not return */
    std::__throw_length_error("cannot create std::vector larger than max_size()");
  }
  in_x8[2] = 0;
  in_x8[1] = 0;
  *in_x8 = 0;
  if (uVar21 == 0) {
    puVar33 = (undefined1 *)0x0;
  }
  else {
    puVar12 = operator_new(uVar21 * 0x60);
    in_x8[2] = (long)(puVar12 + uVar21 * 0x60);
    in_x8[1] = (long)puVar12;
    *in_x8 = (long)puVar12;
    do {
      *(undefined8 *)(puVar12 + 8) = 0;
      *(undefined8 *)(puVar12 + 0x10) = 0;
      *(undefined8 *)(puVar12 + 0x20) = 0;
      *(undefined8 *)(puVar12 + 0x18) = 0;
      *(undefined8 *)(puVar12 + 0x30) = 0;
      *(undefined8 *)(puVar12 + 0x28) = 0;
      *(undefined8 *)(puVar12 + 0x40) = 0;
      *(undefined8 *)(puVar12 + 0x38) = 0;
      *(undefined8 *)(puVar12 + 0x50) = 0;
      *(undefined8 *)(puVar12 + 0x48) = 0;
                    /* try { // try from 0032b2b4 to 0032b2b7 has its CatchHandler @ 0032d650 */
      std::_Deque_base<int,std::allocator<int>>::_M_initialize_map((ulong)(puVar12 + 8));
      uVar21 = uVar21 - 1;
      *puVar12 = 0;
      puVar33 = puVar12 + 0x60;
      puVar12[1] = 0;
      *(undefined4 *)(puVar12 + 4) = 0x7fffffff;
      *(undefined4 *)(puVar12 + 0x58) = 0x7fffffff;
      puVar12 = puVar33;
    } while (uVar21 != 0);
    lVar11 = *(long *)(param_1 + 8) - *(long *)param_1;
  }
  in_x8[1] = (long)puVar33;
  local_2c0 = 0;
  if (lVar11 == 0x20) {
    iVar26 = 0;
  }
  else {
    do {
      uVar31 = local_2c0 + 1;
      uVar21 = lVar11 >> 5;
      *(int *)(*in_x8 + local_2c0 * 0x60 + 0x58) = (int)local_2c0;
      local_2b8 = uVar31;
      if (uVar31 < uVar21) {
        do {
          local_1d0 = 0;
          local_1c0 = (void *)0x0;
          plStack_1d8 = (long *)0x0;
          local_1e0 = (long *)0x0;
          local_1b8 = 0;
          uStack_1a8 = 0;
          local_1b0 = (long *)0x0;
          local_198 = (undefined8 *)0x0;
          local_1a0 = (long *)0x0;
          plStack_188 = (long *)0x0;
          local_190 = (long *)0x0;
          local_178 = (undefined8 *)0x0;
          uStack_180 = 0;
                    /* try { // try from 0032b370 to 0032b373 has its CatchHandler @ 0032d4b0 */
          std::
          _Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
          ::_M_initialize_map((_Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                               *)&local_1c0,0);
          lVar11 = *(long *)param_1;
          lVar43 = local_2b8 * 0x20;
          pPVar2 = (Polygon_2 *)(lVar11 + local_2c0 * 0x20);
          pPVar3 = (Polygon_2 *)(lVar11 + lVar43);
          plVar19 = local_1b0;
          plVar42 = local_1a0;
          puVar29 = local_198;
          plVar17 = local_190;
          plVar18 = plStack_188;
          puVar35 = local_178;
          puVar41 = local_198;
          plVar25 = local_1b0;
          plVar24 = local_1a0;
          puVar8 = local_198;
          plVar37 = local_190;
          plVar14 = plStack_188;
          puVar9 = local_178;
          if ((*(long *)(lVar11 + local_2c0 * 0x20) != *(long *)(pPVar2 + 8)) &&
             (*(long *)(lVar11 + lVar43) != *(long *)(pPVar3 + 8))) {
            local_1f8 = auStack_2c8;
            local_1ef = '\0';
            local_200 = PTR_vtable_004de7e0 + 0x10;
                    /* try { // try from 0032b3d0 to 0032b3d3 has its CatchHandler @ 0032d4a8 */
            pAVar13 = operator_new(0xf0);
            puVar5 = local_1f8;
            puVar1 = PTR_vtable_004defb8 + 0x10;
            *(undefined **)pAVar13 = PTR_vtable_004de2d0 + 0x10;
            *(undefined **)(pAVar13 + 8) = puVar1;
            *(undefined8 *)(pAVar13 + 0x20) = 0;
                    /* try { // try from 0032b410 to 0032b413 has its CatchHandler @ 0032d388 */
            plVar14 = operator_new(0x30);
            *(long **)(pAVar13 + 0x18) = plVar14;
            puVar1 = PTR_vtable_004ddfa8;
            plVar14[2] = 0;
            *plVar14 = (long)(puVar1 + 0x10);
            plVar14[1] = 0;
            *(undefined8 *)(pAVar13 + 0x38) = 0;
            *(undefined2 *)(plVar14 + 3) = 0x404;
            plVar14[5] = (long)plVar14;
            plVar14[4] = (long)plVar14;
                    /* try { // try from 0032b44c to 0032b44f has its CatchHandler @ 0032d740 */
            plVar14 = operator_new(0x50);
            *(long **)(pAVar13 + 0x30) = plVar14;
            puVar1 = PTR_vtable_004deb38;
            plVar14[2] = 0;
            plVar14[3] = 0;
            *plVar14 = (long)(puVar1 + 0x10);
            plVar14[1] = 0;
            *(undefined8 *)(pAVar13 + 0x50) = 0;
            plVar14[4] = 0;
            plVar14[5] = 0;
            plVar14[6] = 0;
            *(undefined4 *)(plVar14 + 7) = 0xffffffff;
            plVar14[9] = (long)plVar14;
            plVar14[8] = (long)plVar14;
                    /* try { // try from 0032b490 to 0032b493 has its CatchHandler @ 0032d738 */
            plVar14 = operator_new(0x78);
            *(undefined4 *)(plVar14 + 1) = 0;
            plVar14[4] = 0;
            plVar14[3] = (long)(plVar14 + 2);
            plVar14[2] = (long)(plVar14 + 2);
            plVar14[6] = (long)(plVar14 + 5);
            plVar14[5] = (long)(plVar14 + 5);
            puVar1 = PTR_vtable_004de8e0;
            plVar14[7] = 0;
            *(long **)(pAVar13 + 0x48) = plVar14;
            plVar14[9] = (long)(plVar14 + 8);
            plVar14[8] = (long)(plVar14 + 8);
            plVar14[10] = 0;
            *plVar14 = (long)(puVar1 + 0x10);
            *(undefined8 *)(pAVar13 + 0x68) = 0;
            *(undefined1 *)(plVar14 + 0xb) = 0;
            plVar14[0xc] = -1;
            plVar14[0xe] = (long)plVar14;
            plVar14[0xd] = (long)plVar14;
                    /* try { // try from 0032b500 to 0032b503 has its CatchHandler @ 0032d730 */
            pvVar15 = operator_new(0x28);
            *(void **)(pAVar13 + 0x60) = pvVar15;
            *(undefined8 *)((long)pvVar15 + 0x10) = 0;
            *(undefined8 *)((long)pvVar15 + 0x18) = 0;
            *(undefined8 *)(pAVar13 + 0x80) = 0;
            *(undefined1 *)((long)pvVar15 + 0x20) = 0;
            *(void **)((long)pvVar15 + 8) = pvVar15;
            *(void **)pvVar15 = pvVar15;
                    /* try { // try from 0032b530 to 0032b533 has its CatchHandler @ 0032d728 */
            pvVar15 = operator_new(0x28);
            *(void **)(pAVar13 + 0x78) = pvVar15;
            *(undefined8 *)((long)pvVar15 + 0x10) = 0;
            *(undefined8 *)((long)pvVar15 + 0x18) = 0;
            *(undefined8 *)(pAVar13 + 0x98) = 0;
            *(undefined1 *)((long)pvVar15 + 0x20) = 0;
            *(void **)((long)pvVar15 + 8) = pvVar15;
            *(void **)pvVar15 = pvVar15;
                    /* try { // try from 0032b560 to 0032b563 has its CatchHandler @ 0032d6f8 */
            pvVar15 = operator_new(0x28);
            *(void **)(pAVar13 + 0x90) = pvVar15;
            *(undefined **)(pAVar13 + 0xa8) = puVar5;
            puVar29 = *(undefined8 **)(pAVar13 + 0x18);
            *(undefined8 *)((long)pvVar15 + 0x10) = 0;
            *(undefined8 *)((long)pvVar15 + 0x18) = 0;
            puVar1 = PTR_vtable_004ddf08;
            pAVar13[0xb0] = (Arrangement_on_surface_2)0x0;
            puVar41 = (undefined8 *)puVar29[4];
            *(undefined **)(pAVar13 + 8) = puVar1 + 0x10;
            *(undefined8 *)(pAVar13 + 0xb8) = 0;
            *(undefined1 *)((long)pvVar15 + 0x20) = 0;
            *(Arrangement_on_surface_2 **)(pAVar13 + 0xd0) = pAVar13 + 200;
            *(Arrangement_on_surface_2 **)(pAVar13 + 200) = pAVar13 + 200;
            *(undefined8 *)(pAVar13 + 0xd8) = 0;
            *(void **)((long)pvVar15 + 8) = pvVar15;
            *(void **)pvVar15 = pvVar15;
            if (puVar29 != puVar41) {
              do {
                if (puVar41 == (undefined8 *)0x0) goto LAB_0032d540;
                puVar29 = (undefined8 *)puVar41[4];
                pcVar30 = *(code **)*puVar41;
                *(undefined8 **)(puVar41[5] + 0x20) = puVar29;
                lVar27 = *(long *)(pAVar13 + 0x20);
                puVar29[5] = puVar41[5];
                *(long *)(pAVar13 + 0x20) = lVar27 + -1;
                (*pcVar30)(puVar41);
                operator_delete(puVar41);
                puVar41 = puVar29;
              } while (*(undefined8 **)(pAVar13 + 0x18) != puVar29);
            }
            puVar41 = (undefined8 *)(*(undefined8 **)(pAVar13 + 0x30))[8];
            if (*(undefined8 **)(pAVar13 + 0x30) != puVar41) {
              do {
                if (puVar41 == (undefined8 *)0x0) goto LAB_0032d540;
                puVar29 = (undefined8 *)puVar41[8];
                lVar27 = puVar41[9];
                lVar28 = *(long *)(pAVar13 + 0x38);
                pcVar30 = *(code **)*puVar41;
                *(undefined8 **)(lVar27 + 0x40) = puVar29;
                puVar29[9] = lVar27;
                *(long *)(pAVar13 + 0x38) = lVar28 + -1;
                (*pcVar30)(puVar41);
                operator_delete(puVar41);
                puVar41 = puVar29;
              } while (*(undefined8 **)(pAVar13 + 0x30) != puVar29);
            }
            puVar41 = (undefined8 *)(*(undefined8 **)(pAVar13 + 0x48))[0xd];
            if (*(undefined8 **)(pAVar13 + 0x48) != puVar41) {
              do {
                if (puVar41 == (undefined8 *)0x0) {
LAB_0032d540:
                    /* WARNING: Does not return */
                  pcVar30 = (code *)SoftwareBreakpoint(1000,0x32d54c);
                  (*pcVar30)();
                }
                puVar29 = (undefined8 *)puVar41[0xd];
                lVar27 = puVar41[0xe];
                lVar28 = *(long *)(pAVar13 + 0x50);
                pcVar30 = *(code **)*puVar41;
                *(undefined8 **)(lVar27 + 0x68) = puVar29;
                puVar29[0xe] = lVar27;
                *(long *)(pAVar13 + 0x50) = lVar28 + -1;
                (*pcVar30)(puVar41);
                operator_delete(puVar41);
                puVar41 = puVar29;
              } while (*(undefined8 **)(pAVar13 + 0x48) != puVar29);
            }
            plVar14 = (long *)**(long **)(pAVar13 + 0x60);
            if (*(long **)(pAVar13 + 0x60) != plVar14) {
              do {
                puVar41 = (undefined8 *)plVar14[1];
                pvVar15 = (void *)*plVar14;
                lVar27 = *(long *)(pAVar13 + 0x68);
                *puVar41 = pvVar15;
                *(undefined8 **)((long)pvVar15 + 8) = puVar41;
                *(long *)(pAVar13 + 0x68) = lVar27 + -1;
                operator_delete(plVar14);
                plVar14 = pvVar15;
              } while (*(void **)(pAVar13 + 0x60) != pvVar15);
            }
            plVar14 = (long *)**(long **)(pAVar13 + 0x78);
            if (*(long **)(pAVar13 + 0x78) != plVar14) {
              do {
                puVar41 = (undefined8 *)plVar14[1];
                pvVar15 = (void *)*plVar14;
                lVar27 = *(long *)(pAVar13 + 0x80);
                *puVar41 = pvVar15;
                *(undefined8 **)((long)pvVar15 + 8) = puVar41;
                *(long *)(pAVar13 + 0x80) = lVar27 + -1;
                operator_delete(plVar14);
                plVar14 = pvVar15;
              } while (*(void **)(pAVar13 + 0x78) != pvVar15);
            }
            plVar14 = (long *)**(long **)(pAVar13 + 0x90);
            if (*(long **)(pAVar13 + 0x90) != plVar14) {
              do {
                puVar41 = (undefined8 *)plVar14[1];
                pvVar15 = (void *)*plVar14;
                lVar27 = *(long *)(pAVar13 + 0x98);
                *puVar41 = pvVar15;
                *(undefined8 **)((long)pvVar15 + 8) = puVar41;
                *(long *)(pAVar13 + 0x98) = lVar27 + -1;
                operator_delete(plVar14);
                plVar14 = pvVar15;
              } while (*(void **)(pAVar13 + 0x90) != pvVar15);
            }
                    /* try { // try from 0032b784 to 0032b787 has its CatchHandler @ 0032d518 */
            plVar14 = operator_new(0x78);
            local_200 = PTR_vtable_004ddf70;
            lVar28 = *(long *)(pAVar13 + 0x48);
            *(undefined1 *)(plVar14 + 0xb) = 0;
            plVar14[0xe] = 0;
            puVar1 = PTR_vtable_004de8e0;
            local_200 = local_200 + 0x10;
            plVar14[4] = 0;
            *plVar14 = (long)(puVar1 + 0x10);
            plVar14[0xe] = *(long *)(lVar28 + 0x70);
            plVar14[3] = (long)(plVar14 + 2);
            plVar14[2] = (long)(plVar14 + 2);
            lVar32 = *(long *)(lVar28 + 0x70);
            plVar14[6] = (long)(plVar14 + 5);
            plVar14[5] = (long)(plVar14 + 5);
            plVar14[7] = 0;
            plVar14[9] = (long)(plVar14 + 8);
            plVar14[8] = (long)(plVar14 + 8);
            plVar14[10] = 0;
            plVar14[0xc] = -1;
            plVar14[0xd] = lVar28;
            lVar27 = *(long *)(pAVar13 + 0x50);
            *(long **)(lVar32 + 0x68) = plVar14;
            *(long **)(lVar28 + 0x70) = plVar14;
            *(long *)(pAVar13 + 0x50) = lVar27 + 1;
            *(undefined4 *)(plVar14 + 1) = 1;
            *(long **)(pAVar13 + 0xb8) = plVar14;
            *(undefined **)(pAVar13 + 0xe0) = puVar5;
            pAVar13[0xe8] = (Arrangement_on_surface_2)0x0;
            local_1e8 = (Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                         *)pAVar13;
                    /* try { // try from 0032b840 to 0032b87f has its CatchHandler @ 0032d748 */
            CGAL::
            Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
            ::_insert((Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                       *)&local_200,pPVar2,pAVar13);
            pAVar16 = local_1e8;
            if (*(long *)(lVar11 + lVar43) != *(long *)(pPVar3 + 8)) {
              if ((*(long *)(local_1e8 + 0x20) == 0) && (*(long *)(local_1e8 + 0x38) == 0)) {
                if ((*(byte *)(*(long *)(*(long *)(local_1e8 + 0x48) + 0x68) + 0x58) & 1) == 0) {
                  pAVar16 = operator_new(0xf0);
                  puVar5 = local_1f8;
                  puVar1 = PTR_vtable_004defb8 + 0x10;
                  *(undefined **)pAVar16 = PTR_vtable_004de2d0 + 0x10;
                  *(undefined **)(pAVar16 + 8) = puVar1;
                    /* try { // try from 0032b8b4 to 0032b8b7 has its CatchHandler @ 0032d6b4 */
                  CGAL::
                  Arr_dcel_base<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base,std::allocator<int>>
                  ::Arr_dcel_base((Arr_dcel_base<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base,std::allocator<int>>
                                   *)(pAVar16 + 0x10));
                  puVar1 = PTR_vtable_004ddf08;
                  *(undefined **)(pAVar16 + 0xa8) = puVar5;
                  *(Arrangement_on_surface_2 *)(pAVar16 + 0xb0) = (Arrangement_on_surface_2)0x0;
                  *(undefined **)(pAVar16 + 8) = puVar1 + 0x10;
                  *(undefined8 *)(pAVar16 + 0xb8) = 0;
                  *(Arrangement_on_surface_2 **)(pAVar16 + 0xd0) =
                       (Arrangement_on_surface_2 *)(pAVar16 + 200);
                  *(Arrangement_on_surface_2 **)(pAVar16 + 200) =
                       (Arrangement_on_surface_2 *)(pAVar16 + 200);
                  *(undefined8 *)(pAVar16 + 0xd8) = 0;
                  CGAL::
                  Arr_dcel_base<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base,std::allocator<int>>
                  ::delete_all((Arr_dcel_base<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base,std::allocator<int>>
                                *)(pAVar16 + 0x10));
                    /* try { // try from 0032b8ec to 0032b8ef has its CatchHandler @ 0032d54c */
                  plVar14 = operator_new(0x78);
                  *(undefined1 *)(plVar14 + 0xb) = 0;
                  lVar11 = *(long *)(pAVar16 + 0x48);
                  lVar43 = *(long *)(pAVar16 + 0x50);
                  plVar14[0xe] = 0;
                  *plVar14 = (long)(PTR_vtable_004de8e0 + 0x10);
                  plVar14[0xe] = *(long *)(lVar11 + 0x70);
                  plVar14[3] = (long)(plVar14 + 2);
                  plVar14[2] = (long)(plVar14 + 2);
                  lVar27 = *(long *)(lVar11 + 0x70);
                  plVar14[4] = 0;
                  plVar14[6] = (long)(plVar14 + 5);
                  plVar14[5] = (long)(plVar14 + 5);
                  plVar14[7] = 0;
                  plVar14[9] = (long)(plVar14 + 8);
                  plVar14[8] = (long)(plVar14 + 8);
                  plVar14[10] = 0;
                  plVar14[0xc] = -1;
                  plVar14[0xd] = lVar11;
                  *(long **)(lVar27 + 0x68) = plVar14;
                  *(long **)(lVar11 + 0x70) = plVar14;
                  *(long *)(pAVar16 + 0x50) = lVar43 + 1;
                  *(long **)(pAVar16 + 0xb8) = plVar14;
                  *(undefined4 *)(plVar14 + 1) = 1;
                  *(undefined **)(pAVar16 + 0xe0) = puVar5;
                  *(Arrangement_on_surface_2 *)(pAVar16 + 0xe8) = (Arrangement_on_surface_2)0x0;
                    /* try { // try from 0032b988 to 0032b9cf has its CatchHandler @ 0032d748 */
                  CGAL::
                  Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                  ::_insert((Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                             *)&local_200,pPVar3,(Arrangement_on_surface_2 *)pAVar16);
                  pAVar6 = local_1e8;
                  if (local_1e8 !=
                      (Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                       *)0x0) {
                    if (*(code **)(*(long *)local_1e8 + 8) ==
                        (code *)PTR__Arrangement_on_surface_2_004de980) {
                      CGAL::
                      Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                      ::~Arrangement_on_surface_2(local_1e8);
                      operator_delete(pAVar6,0xf0);
                    }
                    else {
                      (**(code **)(*(long *)local_1e8 + 8))();
                    }
                  }
                }
              }
              else {
                plStack_e0 = (long *)0x0;
                local_100 = PTR_vtable_004de2d0 + 0x10;
                local_f8 = PTR_vtable_004defb8 + 0x10;
                    /* try { // try from 0032bd64 to 0032bd67 has its CatchHandler @ 0032d748 */
                local_e8 = operator_new(0x30);
                puVar1 = PTR_vtable_004ddfa8;
                local_e8[2] = 0;
                *local_e8 = (long)(puVar1 + 0x10);
                local_e8[1] = 0;
                *(undefined2 *)(local_e8 + 3) = 0x404;
                local_e8[5] = (long)local_e8;
                local_e8[4] = (long)local_e8;
                local_c8 = (long *)0x0;
                    /* try { // try from 0032bd9c to 0032bd9f has its CatchHandler @ 0032d5f8 */
                plStack_d0 = operator_new(0x50);
                puVar1 = PTR_vtable_004deb38;
                plStack_d0[2] = 0;
                plStack_d0[3] = 0;
                *plStack_d0 = (long)(puVar1 + 0x10);
                plStack_d0[1] = 0;
                plStack_d0[4] = 0;
                plStack_d0[5] = 0;
                plStack_d0[6] = 0;
                *(undefined4 *)(plStack_d0 + 7) = 0xffffffff;
                plStack_d0[9] = (long)plStack_d0;
                plStack_d0[8] = (long)plStack_d0;
                lStack_b0 = 0;
                    /* try { // try from 0032bddc to 0032bddf has its CatchHandler @ 0032d45c */
                local_b8 = operator_new(0x78);
                *(undefined4 *)(local_b8 + 1) = 0;
                local_b8[4] = 0;
                local_b8[3] = (long)(local_b8 + 2);
                local_b8[2] = (long)(local_b8 + 2);
                local_b8[6] = (long)(local_b8 + 5);
                local_b8[5] = (long)(local_b8 + 5);
                puVar1 = PTR_vtable_004de8e0;
                local_b8[7] = 0;
                local_b8[9] = (long)(local_b8 + 8);
                local_b8[8] = (long)(local_b8 + 8);
                local_b8[10] = 0;
                *local_b8 = (long)(puVar1 + 0x10);
                *(undefined1 *)(local_b8 + 0xb) = 0;
                local_b8[0xc] = -1;
                local_b8[0xe] = (long)local_b8;
                local_b8[0xd] = (long)local_b8;
                local_98 = 0;
                    /* try { // try from 0032be48 to 0032be4b has its CatchHandler @ 0032d438 */
                local_a0 = operator_new(0x28);
                local_80 = 0;
                local_a0[2] = (undefined8 ******)0x0;
                local_a0[3] = (undefined8 ******)0x0;
                *(undefined1 *)(local_a0 + 4) = 0;
                local_a0[1] = local_a0;
                *local_a0 = local_a0;
                    /* try { // try from 0032be6c to 0032be6f has its CatchHandler @ 0032d6ec */
                local_88 = operator_new(0x28);
                local_68 = 0;
                local_88[2] = 0;
                local_88[3] = 0;
                *(undefined1 *)(local_88 + 4) = 0;
                local_88[1] = local_88;
                *local_88 = local_88;
                    /* try { // try from 0032be90 to 0032be93 has its CatchHandler @ 0032d6d0 */
                local_70 = operator_new(0x28);
                local_50 = 1;
                local_70[2] = 0;
                local_70[3] = 0;
                *(undefined1 *)(local_70 + 4) = 0;
                local_70[1] = local_70;
                *local_70 = local_70;
                    /* try { // try from 0032beb8 to 0032bebb has its CatchHandler @ 0032d6bc */
                local_58 = operator_new(1);
                local_38 = &local_38;
                local_f8 = PTR_vtable_004ddf08 + 0x10;
                local_48 = (long *)0x0;
                local_28 = 0;
                plVar14 = (long *)local_e8[4];
                local_30 = local_38;
                if (local_e8 != (long *)local_e8[4]) {
                  do {
                    if (plVar14 == (long *)0x0) goto LAB_0032d468;
                    plVar19 = (long *)plVar14[4];
                    pcVar30 = *(code **)*plVar14;
                    *(long **)(plVar14[5] + 0x20) = plVar19;
                    plStack_e0 = (long *)((long)plStack_e0 + -1);
                    plVar19[5] = plVar14[5];
                    (*pcVar30)(plVar14);
                    operator_delete(plVar14);
                    plVar14 = plVar19;
                  } while (local_e8 != plVar19);
                }
                plVar14 = (long *)plStack_d0[8];
                if (plStack_d0 != (long *)plStack_d0[8]) {
                  do {
                    if (plVar14 == (long *)0x0) goto LAB_0032d468;
                    plVar19 = (long *)plVar14[8];
                    lVar11 = plVar14[9];
                    pcVar30 = *(code **)*plVar14;
                    *(long **)(lVar11 + 0x40) = plVar19;
                    local_c8 = (long *)((long)local_c8 + -1);
                    plVar19[9] = lVar11;
                    (*pcVar30)(plVar14);
                    operator_delete(plVar14);
                    plVar14 = plVar19;
                  } while (plStack_d0 != plVar19);
                }
                plVar14 = (long *)local_b8[0xd];
                if (local_b8 != (long *)local_b8[0xd]) {
                  do {
                    if (plVar14 == (long *)0x0) {
LAB_0032d468:
                    /* WARNING: Does not return */
                      pcVar30 = (code *)SoftwareBreakpoint(1000,0x32d474);
                      (*pcVar30)();
                    }
                    plVar19 = (long *)plVar14[0xd];
                    lVar11 = plVar14[0xe];
                    pcVar30 = *(code **)*plVar14;
                    *(long **)(lVar11 + 0x68) = plVar19;
                    lStack_b0 = lStack_b0 + -1;
                    plVar19[0xe] = lVar11;
                    (*pcVar30)(plVar14);
                    operator_delete(plVar14);
                    plVar14 = plVar19;
                  } while (local_b8 != plVar19);
                }
                pppppppuVar34 = (undefined8 *******)*local_a0;
                if (local_a0 != (undefined8 *******)*local_a0) {
                  do {
                    ppppppuVar36 = pppppppuVar34[1];
                    pppppppuVar40 = (undefined8 *******)*pppppppuVar34;
                    *ppppppuVar36 = pppppppuVar40;
                    pppppppuVar40[1] = ppppppuVar36;
                    local_98 = local_98 + -1;
                    operator_delete(pppppppuVar34);
                    pppppppuVar34 = pppppppuVar40;
                  } while (local_a0 != pppppppuVar40);
                }
                puVar41 = (undefined8 *)*local_88;
                if (local_88 != (undefined8 *)*local_88) {
                  do {
                    puVar29 = (undefined8 *)puVar41[1];
                    puVar35 = (undefined8 *)*puVar41;
                    *puVar29 = puVar35;
                    puVar35[1] = puVar29;
                    local_80 = local_80 + -1;
                    operator_delete(puVar41);
                    puVar41 = puVar35;
                  } while (local_88 != puVar35);
                }
                puVar41 = (undefined8 *)*local_70;
                if (local_70 != (undefined8 *)*local_70) {
                  do {
                    puVar29 = (undefined8 *)puVar41[1];
                    puVar35 = (undefined8 *)*puVar41;
                    *puVar29 = puVar35;
                    puVar35[1] = puVar29;
                    local_68 = local_68 + -1;
                    operator_delete(puVar41);
                    puVar41 = puVar35;
                  } while (local_70 != puVar35);
                }
                    /* try { // try from 0032c0bc to 0032c14f has its CatchHandler @ 0032d61c */
                local_48 = operator_new(0x78);
                local_48[4] = 0;
                puVar1 = PTR_vtable_004de8e0;
                local_48[3] = (long)(local_48 + 2);
                local_48[2] = (long)(local_48 + 2);
                local_48[6] = (long)(local_48 + 5);
                local_48[5] = (long)(local_48 + 5);
                local_48[7] = 0;
                local_48[9] = (long)(local_48 + 8);
                local_48[8] = (long)(local_48 + 8);
                local_48[10] = 0;
                *(undefined1 *)(local_48 + 0xb) = 0;
                local_48[0xe] = 0;
                *local_48 = (long)(puVar1 + 0x10);
                local_48[0xe] = local_b8[0xe];
                local_48[0xc] = -1;
                lVar11 = local_b8[0xe];
                local_48[0xd] = (long)local_b8;
                lStack_b0 = lStack_b0 + 1;
                *(long **)(lVar11 + 0x68) = local_48;
                local_b8[0xe] = (long)local_48;
                *(undefined4 *)(local_48 + 1) = 1;
                local_20 = operator_new(1);
                local_18 = 1;
                    /* try { // try from 0032c16c to 0032c177 has its CatchHandler @ 0032d614 */
                CGAL::
                Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                ::_insert((Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                           *)&local_200,pPVar3,(Arrangement_on_surface_2 *)&local_100);
                pAVar13 = operator_new(0xf0);
                puVar5 = local_1f8;
                puVar1 = PTR_vtable_004defb8;
                *(undefined **)pAVar13 = PTR_vtable_004de2d0 + 0x10;
                *(undefined **)(pAVar13 + 8) = puVar1 + 0x10;
                *(undefined8 *)(pAVar13 + 0x20) = 0;
                    /* try { // try from 0032c1b0 to 0032c1b3 has its CatchHandler @ 0032d510 */
                plVar14 = operator_new(0x30);
                *(long **)(pAVar13 + 0x18) = plVar14;
                puVar1 = PTR_vtable_004ddfa8;
                plVar14[2] = 0;
                *plVar14 = (long)(puVar1 + 0x10);
                plVar14[1] = 0;
                *(undefined8 *)(pAVar13 + 0x38) = 0;
                *(undefined2 *)(plVar14 + 3) = 0x404;
                plVar14[5] = (long)plVar14;
                plVar14[4] = (long)plVar14;
                    /* try { // try from 0032c1ec to 0032c1ef has its CatchHandler @ 0032d508 */
                plVar14 = operator_new(0x50);
                *(long **)(pAVar13 + 0x30) = plVar14;
                puVar1 = PTR_vtable_004deb38;
                plVar14[2] = 0;
                plVar14[3] = 0;
                *plVar14 = (long)(puVar1 + 0x10);
                plVar14[1] = 0;
                *(undefined8 *)(pAVar13 + 0x50) = 0;
                plVar14[4] = 0;
                plVar14[5] = 0;
                plVar14[6] = 0;
                *(undefined4 *)(plVar14 + 7) = 0xffffffff;
                plVar14[9] = (long)plVar14;
                plVar14[8] = (long)plVar14;
                    /* try { // try from 0032c230 to 0032c233 has its CatchHandler @ 0032d500 */
                plVar14 = operator_new(0x78);
                *(undefined4 *)(plVar14 + 1) = 0;
                plVar14[4] = 0;
                plVar14[3] = (long)(plVar14 + 2);
                plVar14[2] = (long)(plVar14 + 2);
                plVar14[6] = (long)(plVar14 + 5);
                plVar14[5] = (long)(plVar14 + 5);
                puVar1 = PTR_vtable_004de8e0;
                plVar14[7] = 0;
                *(long **)(pAVar13 + 0x48) = plVar14;
                plVar14[9] = (long)(plVar14 + 8);
                plVar14[8] = (long)(plVar14 + 8);
                plVar14[10] = 0;
                *plVar14 = (long)(puVar1 + 0x10);
                *(undefined8 *)(pAVar13 + 0x68) = 0;
                *(undefined1 *)(plVar14 + 0xb) = 0;
                plVar14[0xc] = -1;
                plVar14[0xe] = (long)plVar14;
                plVar14[0xd] = (long)plVar14;
                    /* try { // try from 0032c2a0 to 0032c2a3 has its CatchHandler @ 0032d4f8 */
                pvVar15 = operator_new(0x28);
                *(void **)(pAVar13 + 0x60) = pvVar15;
                *(undefined8 *)((long)pvVar15 + 0x10) = 0;
                *(undefined8 *)((long)pvVar15 + 0x18) = 0;
                *(undefined8 *)(pAVar13 + 0x80) = 0;
                *(undefined1 *)((long)pvVar15 + 0x20) = 0;
                *(void **)((long)pvVar15 + 8) = pvVar15;
                *(void **)pvVar15 = pvVar15;
                    /* try { // try from 0032c2c8 to 0032c2cb has its CatchHandler @ 0032d4f0 */
                pvVar15 = operator_new(0x28);
                *(void **)(pAVar13 + 0x78) = pvVar15;
                *(undefined8 *)((long)pvVar15 + 0x10) = 0;
                *(undefined8 *)((long)pvVar15 + 0x18) = 0;
                *(undefined8 *)(pAVar13 + 0x98) = 0;
                *(undefined1 *)((long)pvVar15 + 0x20) = 0;
                *(void **)((long)pvVar15 + 8) = pvVar15;
                *(void **)pvVar15 = pvVar15;
                    /* try { // try from 0032c2f8 to 0032c2fb has its CatchHandler @ 0032d4c0 */
                pvVar15 = operator_new(0x28);
                puVar1 = PTR_vtable_004ddf08;
                *(void **)(pAVar13 + 0x90) = pvVar15;
                *(undefined **)(pAVar13 + 0xa8) = puVar5;
                pAVar13[0xb0] = (Arrangement_on_surface_2)0x0;
                *(undefined **)(pAVar13 + 8) = puVar1 + 0x10;
                *(undefined8 *)(pAVar13 + 0xb8) = 0;
                *(undefined8 *)((long)pvVar15 + 0x10) = 0;
                *(undefined8 *)((long)pvVar15 + 0x18) = 0;
                *(Arrangement_on_surface_2 **)(pAVar13 + 0xd0) = pAVar13 + 200;
                *(Arrangement_on_surface_2 **)(pAVar13 + 200) = pAVar13 + 200;
                *(undefined8 *)(pAVar13 + 0xd8) = 0;
                *(undefined1 *)((long)pvVar15 + 0x20) = 0;
                *(void **)((long)pvVar15 + 8) = pvVar15;
                *(void **)pvVar15 = pvVar15;
                    /* try { // try from 0032c344 to 0032c347 has its CatchHandler @ 0032d3f4 */
                CGAL::
                Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>
                ::init_dcel((Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>
                             *)(pAVar13 + 8));
                *(undefined **)(pAVar13 + 0xe0) = puVar5;
                pAVar13[0xe8] = (Arrangement_on_surface_2)0x0;
                    /* try { // try from 0032c360 to 0032c3a7 has its CatchHandler @ 0032d614 */
                CGAL::
                overlay<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<C___AL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>>>
                          ((Arrangement_on_surface_2 *)local_1e8,
                           (Arrangement_on_surface_2 *)&local_100,pAVar13,
                           (Gps_join_functor *)&local_170);
                pAVar16 = local_1e8;
                if (local_1e8 !=
                    (Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                     *)0x0) {
                  if (*(code **)(*(long *)local_1e8 + 8) ==
                      (code *)PTR__Arrangement_on_surface_2_004de980) {
                    CGAL::
                    Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                    ::~Arrangement_on_surface_2(local_1e8);
                    operator_delete(pAVar16,0xf0);
                  }
                  else {
                    (**(code **)(*(long *)local_1e8 + 8))();
                  }
                }
                local_1e8 = (Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                             *)pAVar13;
                CGAL::
                Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                ::_remove_redundant_edges
                          ((Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                            *)&local_200,pAVar13);
                CGAL::
                Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                ::~Arrangement_on_surface_2
                          ((Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                            *)&local_100);
                pAVar16 = local_1e8;
              }
            }
            local_1e8 = pAVar16;
            lVar11 = CGAL::
                     Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                     ::number_of_polygons_with_holes
                               ((Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::PreconditionValidationPolicy>
                                 *)&local_200);
            bVar10 = false;
            if (lVar11 == 1) {
              local_f8 = (undefined *)0x0;
              local_100 = local_1f8;
              local_f0 = 0;
              plStack_e0 = (long *)0x0;
              local_e8 = (long *)0x0;
              plStack_d0 = (long *)0x0;
              local_d8 = (long *)0x0;
              uStack_c0 = 0;
              local_c8 = (long *)0x0;
              lStack_b0 = 0;
              local_b8 = (long *)0x0;
                    /* try { // try from 0032c464 to 0032c467 has its CatchHandler @ 0032d748 */
              std::
              _Deque_base<CGAL::I_Filtered_const_iterator<CGAL::internal::In_place_list_const_iterator<CGAL::Arr_face<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base>,std::allocator<CGAL::Arr_face<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base>>>,CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>::_Is_valid_face,C...::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>::Face,long,std::bidirectional_iterator_tag>>>
              ::_M_initialize_map((_Deque_base<CGAL::I_Filtered_const_iterator<CGAL::internal::In_place_list_const_iterator<CGAL::Arr_face<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base>,std::allocator<CGAL::Arr_face<CGAL::Arr_vertex_base<CGAL::Point_2<CGAL::Epeck>>,CGAL::Gps_halfedge_base<CGAL::Arr_segment_2<CGAL::Epeck>>,CGAL::Gps_face_base>>>,CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>::_Is_valid_face,C___::Epeck>>>_CGAL__Arr_segment_traits_2<CGAL::Epeck>>>>>__Face_long_std__bidirectional_iterator_tag>>>
                                   *)&local_f8,0);
              pAVar16 = local_1e8;
              local_a8 = &local_a8;
              pAVar13 = (Arrangement_on_surface_2 *)(local_1e8 + 8);
              local_98 = 0;
              lVar11 = *(long *)(local_1e8 + 0x48);
              local_380 = *(long *)(lVar11 + 0x68);
              local_a0 = local_a8;
              local_90 = (vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                          *)&local_1e0;
              if (lVar11 != local_380) {
                lVar43 = lVar11;
                do {
                  while ((*(long *)(local_380 + 0x20) != 0 ||
                         (bVar4 = *(byte *)(local_380 + 0x58), (bVar4 >> 1 & 1) != 0))) {
                    local_380 = *(long *)(local_380 + 0x68);
                    if (local_380 == lVar43) goto LAB_0032cb84;
                  }
                  if ((bVar4 & 1) == 0) {
                    *(byte *)(local_380 + 0x58) = bVar4 | 2;
                    plVar14 = (long *)(local_380 + 0x28);
                    local_378 = (long *)*plVar14;
                    if (local_378 != plVar14) {
LAB_0032cda8:
                      do {
                        local_2a0 = 0;
                        lVar27 = local_378[2];
                        local_220 = (long *)0x0;
                        plStack_218 = (long *)0x0;
                        local_210 = 0;
                        local_2e0 = 0;
                        local_2f0 = lVar27;
                        lStack_2e8 = lVar27;
                        local_2b0 = lVar27;
                        lStack_2a8 = lVar27;
                    /* try { // try from 0032cde4 to 0032ce83 has its CatchHandler @ 0032d648 */
                        CGAL::
                        Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::NoValidationPolicy>
                        ::construct_polygon(&local_2f0,&local_220,local_100);
                        lVar43 = lVar27;
                        do {
                          while( true ) {
                            uVar21 = *(ulong *)(*(long *)(lVar43 + 8) + 0x28);
                            if ((uVar21 & 1) != 0) {
                              uVar21 = uVar21 & 0xfffffffffffffffe;
                            }
                            lVar28 = *(long *)(uVar21 + 0x10);
                            if ((*(byte *)(lVar28 + 0x58) >> 1 & 1) != 0) break;
                            local_280 = 0;
                            local_300 = (Arrangement_on_surface_2 *)0x0;
                            local_290 = lVar28;
                            lStack_288 = lVar28;
                            local_310 = lVar28;
                            lStack_308 = lVar28;
                            CGAL::
                            Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                            ::all_incident_faces
                                      ((Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                        *)&local_100,&local_310);
                            lVar43 = *(long *)(lVar43 + 0x18);
                            if (lVar27 == lVar43) goto LAB_0032ce44;
                          }
                          lVar43 = *(long *)(lVar43 + 0x18);
                        } while (lVar27 != lVar43);
LAB_0032ce44:
                        pppppppuVar34 = local_a8;
                        local_160 = 0;
                        plVar19 = (long *)0x0;
                        local_170 = (long *)0x0;
                        plStack_168 = (long *)0x0;
                        uVar21 = (long)plStack_218 - (long)local_220;
                        if ((long)uVar21 >> 3 != 0) {
                          if (0xfffffffffffffff < (ulong)((long)uVar21 >> 3)) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 0032d35c to 0032d35f has its CatchHandler @ 0032d648 */
                            std::__throw_bad_alloc();
                          }
                          plVar19 = operator_new(uVar21);
                        }
                        local_160 = (long)plVar19 + uVar21;
                        plVar42 = local_220;
                        plVar17 = plVar19;
                        plStack_168 = plVar19;
                        if (local_220 != plStack_218) {
                          do {
                            plVar18 = plVar42 + 1;
                            lVar43 = *plVar42;
                            *plVar17 = lVar43;
                            *(int *)(lVar43 + 8) = *(int *)(lVar43 + 8) + 1;
                            plVar42 = plVar18;
                            plVar17 = plVar17 + 1;
                          } while (plStack_218 != plVar18);
                          plStack_168 = (long *)((long)plVar19 +
                                                ((long)plStack_218 - (long)local_220));
                        }
                        local_150 = (void *)0x0;
                        local_148 = 0;
                        local_140 = (long *)0x0;
                        uStack_138 = 0;
                        local_130 = (long *)0x0;
                        local_128 = (undefined8 *)0x0;
                        local_120 = (long *)0x0;
                        plStack_118 = (long *)0x0;
                        local_110 = 0;
                        local_108 = (undefined8 *)0x0;
                        local_170 = plVar19;
                    /* try { // try from 0032cf1c to 0032cf1f has its CatchHandler @ 0032d6cc */
                        std::
                        deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                        ::
                        _M_range_initialize<std::_List_iterator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                  ((deque *)&local_150,pppppppuVar34,&local_a8,0);
                        pvVar7 = local_90;
                    /* try { // try from 0032cf2c to 0032cf3b has its CatchHandler @ 0032d6b0 */
                        std::
                        vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                        ::operator=(local_90,(vector *)&local_170);
                        std::
                        deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                        ::operator=((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                     *)(pvVar7 + 0x20),(deque *)&local_150);
                        plVar19 = local_140;
                        plVar17 = local_130;
                        puVar41 = local_128;
                        plVar18 = local_120;
                        plVar42 = plStack_118;
                        puVar29 = local_108;
                        pppppppuVar34 = local_a8;
                        while (local_140 = plVar19, local_130 = plVar17, local_128 = puVar41,
                              local_120 = plVar18, plStack_118 = plVar42, local_108 = puVar29,
                              (undefined8 ********)pppppppuVar34 != &local_a8) {
                          ppppppuVar36 = pppppppuVar34[2];
                          pppppppuVar40 = (undefined8 *******)*pppppppuVar34;
                          ppppppuVar38 = pppppppuVar34[3];
                          if (ppppppuVar36 != ppppppuVar38) {
                            do {
                              pppppuVar20 = *ppppppuVar36;
                              if ((pppppuVar20 != (undefined8 *****)0x0) &&
                                 (iVar26 = *(int *)(pppppuVar20 + 1),
                                 *(int *)(pppppuVar20 + 1) = iVar26 + -1, iVar26 + -1 == 0)) {
                                (*(code *)(*pppppuVar20)[1])();
                              }
                              ppppppuVar36 = ppppppuVar36 + 1;
                            } while (ppppppuVar38 != ppppppuVar36);
                            ppppppuVar38 = pppppppuVar34[2];
                          }
                          if (ppppppuVar38 == (undefined8 ******)0x0) {
                            operator_delete(pppppppuVar34);
                            plVar19 = local_140;
                            plVar17 = local_130;
                            puVar41 = local_128;
                            plVar18 = local_120;
                            plVar42 = plStack_118;
                            puVar29 = local_108;
                            pppppppuVar34 = pppppppuVar40;
                          }
                          else {
                            operator_delete(ppppppuVar38);
                            operator_delete(pppppppuVar34);
                            plVar19 = local_140;
                            plVar17 = local_130;
                            puVar41 = local_128;
                            plVar18 = local_120;
                            plVar42 = plStack_118;
                            puVar29 = local_108;
                            pppppppuVar34 = pppppppuVar40;
                          }
                        }
                        local_a8 = &local_a8;
                        local_98 = 0;
                        local_a0 = local_a8;
                        puVar35 = puVar41;
joined_r0x0032d004:
                        puVar35 = puVar35 + 1;
                        if (puVar35 < puVar29) {
                          plVar24 = (long *)*puVar35;
                          plVar25 = plVar24 + 0x40;
                          do {
                            while( true ) {
                              plVar37 = (long *)*plVar24;
                              plVar23 = (long *)plVar24[1];
                              if (plVar37 != plVar23) {
                                do {
                                  plVar39 = (long *)*plVar37;
                                  if ((plVar39 != (long *)0x0) &&
                                     (iVar26 = (int)plVar39[1] + -1, *(int *)(plVar39 + 1) = iVar26,
                                     iVar26 == 0)) {
                                    (**(code **)(*plVar39 + 8))();
                                  }
                                  plVar37 = plVar37 + 1;
                                } while (plVar23 != plVar37);
                                plVar23 = (long *)*plVar24;
                              }
                              if (plVar23 != (long *)0x0) break;
                              plVar24 = plVar24 + 4;
                              if (plVar24 == plVar25) goto joined_r0x0032d004;
                            }
                            plVar24 = plVar24 + 4;
                            operator_delete(plVar23);
                          } while (plVar24 != plVar25);
                          goto joined_r0x0032d004;
                        }
                        if (puVar41 == puVar29) {
                          for (; plVar19 != plVar18; plVar19 = plVar19 + 4) {
                            while( true ) {
                              plVar42 = (long *)*plVar19;
                              plVar17 = (long *)plVar19[1];
                              if (plVar42 != plVar17) {
                                do {
                                  plVar25 = (long *)*plVar42;
                                  if ((plVar25 != (long *)0x0) &&
                                     (iVar26 = (int)plVar25[1] + -1, *(int *)(plVar25 + 1) = iVar26,
                                     iVar26 == 0)) {
                                    (**(code **)(*plVar25 + 8))();
                                  }
                                  plVar42 = plVar42 + 1;
                                } while (plVar17 != plVar42);
                                plVar17 = (long *)*plVar19;
                              }
                              if (plVar17 == (long *)0x0) break;
                              plVar19 = plVar19 + 4;
                              operator_delete(plVar17);
                              if (plVar18 == plVar19) goto LAB_0032d164;
                            }
                          }
                        }
                        else {
                          for (; plVar19 != plVar17; plVar19 = plVar19 + 4) {
                            while( true ) {
                              plVar25 = (long *)*plVar19;
                              plVar24 = (long *)plVar19[1];
                              if (plVar25 != plVar24) {
                                do {
                                  plVar37 = (long *)*plVar25;
                                  if ((plVar37 != (long *)0x0) &&
                                     (iVar26 = (int)plVar37[1] + -1, *(int *)(plVar37 + 1) = iVar26,
                                     iVar26 == 0)) {
                                    (**(code **)(*plVar37 + 8))();
                                  }
                                  plVar25 = plVar25 + 1;
                                } while (plVar24 != plVar25);
                                plVar24 = (long *)*plVar19;
                              }
                              if (plVar24 == (long *)0x0) break;
                              plVar19 = plVar19 + 4;
                              operator_delete(plVar24);
                              if (plVar17 == plVar19) goto joined_r0x0032d100;
                            }
                          }
joined_r0x0032d100:
                          while (plVar18 != plVar42) {
                            plVar19 = (long *)*plVar42;
                            plVar17 = *(long **)((long)plVar42 + 8);
                            if (plVar19 != plVar17) {
                              do {
                                plVar25 = (long *)*plVar19;
                                if ((plVar25 != (long *)0x0) &&
                                   (iVar26 = (int)plVar25[1] + -1, *(int *)(plVar25 + 1) = iVar26,
                                   iVar26 == 0)) {
                                  (**(code **)(*plVar25 + 8))();
                                }
                                plVar19 = plVar19 + 1;
                              } while (plVar17 != plVar19);
                              plVar17 = (long *)*plVar42;
                            }
                            if (plVar17 == (long *)0x0) {
                              plVar42 = (long *)((long)plVar42 + 0x20);
                            }
                            else {
                              plVar42 = (long *)((long)plVar42 + 0x20);
                              operator_delete(plVar17);
                            }
                          }
                        }
LAB_0032d164:
                        plVar19 = local_170;
                        plVar42 = plStack_168;
                        plVar17 = plStack_168;
                        if (local_150 != (void *)0x0) {
                          puVar41 = local_108 + 1;
                          for (puVar29 = local_128; puVar29 < puVar41; puVar29 = puVar29 + 1) {
                            operator_delete((void *)*puVar29);
                          }
                          operator_delete(local_150);
                          plVar19 = local_170;
                          plVar42 = plStack_168;
                          plVar17 = plStack_168;
                        }
                        for (; plVar18 = plStack_168, plVar19 != plStack_168; plVar19 = plVar19 + 1)
                        {
                          plVar42 = (long *)*plVar19;
                          plStack_168 = plVar17;
                          if ((plVar42 != (long *)0x0) &&
                             (iVar26 = (int)plVar42[1] + -1, *(int *)(plVar42 + 1) = iVar26,
                             iVar26 == 0)) {
                            (**(code **)(*plVar42 + 8))();
                          }
                          plVar42 = local_170;
                          plVar17 = plStack_168;
                          plStack_168 = plVar18;
                        }
                        plVar19 = local_220;
                        plVar18 = plStack_218;
                        plVar25 = plStack_218;
                        plStack_168 = plVar17;
                        if (plVar42 != (long *)0x0) {
                          operator_delete(plVar42);
                          plVar19 = local_220;
                          plVar18 = plStack_218;
                          plVar25 = plStack_218;
                        }
                        for (; plVar42 = plStack_218, plVar19 != plStack_218; plVar19 = plVar19 + 1)
                        {
                          plVar17 = (long *)*plVar19;
                          plStack_218 = plVar25;
                          if ((plVar17 != (long *)0x0) &&
                             (iVar26 = (int)plVar17[1] + -1, *(int *)(plVar17 + 1) = iVar26,
                             iVar26 == 0)) {
                            (**(code **)(*plVar17 + 8))();
                          }
                          plVar18 = local_220;
                          plVar25 = plStack_218;
                          plStack_218 = plVar42;
                        }
                        if (plVar18 == (long *)0x0) {
                          local_378 = (long *)*local_378;
                          plStack_218 = plVar25;
                          if (local_378 == plVar14) break;
                          goto LAB_0032cda8;
                        }
                        plStack_218 = plVar25;
                        operator_delete(plVar18);
                        local_378 = (long *)*local_378;
                      } while (plVar14 != local_378);
                    }
                  }
                  else {
                    local_238 = local_380;
                    local_310 = local_380;
                    local_230 = lVar11;
                    local_228 = pAVar13;
                    lStack_308 = lVar11;
                    local_300 = pAVar13;
                    /* try { // try from 0032c510 to 0032c513 has its CatchHandler @ 0032d3c4 */
                    CGAL::
                    Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                    ::all_incident_faces
                              ((Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                *)&local_100,&local_310);
                    plStack_218 = (long *)0x0;
                    local_220 = (long *)0x0;
                    local_210 = 0;
                    plStack_168 = (long *)0x0;
                    local_170 = (long *)0x0;
                    local_160 = 0;
                    local_150 = (void *)0x0;
                    local_148 = 0;
                    uStack_138 = 0;
                    local_140 = (long *)0x0;
                    local_128 = (undefined8 *)0x0;
                    local_130 = (long *)0x0;
                    plStack_118 = (long *)0x0;
                    local_120 = (long *)0x0;
                    local_108 = (undefined8 *)0x0;
                    local_110 = 0;
                    /* try { // try from 0032c548 to 0032c54b has its CatchHandler @ 0032d474 */
                    std::
                    deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                    ::
                    _M_range_initialize<std::_List_iterator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                              ((deque *)&local_150,local_a8,&local_a8,0);
                    pvVar7 = local_90;
                    /* try { // try from 0032c558 to 0032c567 has its CatchHandler @ 0032d5dc */
                    std::
                    vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                    operator=(local_90,(vector *)&local_170);
                    std::
                    deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                    ::operator=((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                 *)(pvVar7 + 0x20),(deque *)&local_150);
                    pppppppuVar34 = local_a8;
                    while ((undefined8 ********)pppppppuVar34 != &local_a8) {
                      ppppppuVar36 = pppppppuVar34[2];
                      pppppppuVar40 = (undefined8 *******)*pppppppuVar34;
                      ppppppuVar38 = pppppppuVar34[3];
                      if (ppppppuVar36 != ppppppuVar38) {
                        do {
                          pppppuVar20 = *ppppppuVar36;
                          if ((pppppuVar20 != (undefined8 *****)0x0) &&
                             (iVar26 = *(int *)(pppppuVar20 + 1),
                             *(int *)(pppppuVar20 + 1) = iVar26 + -1, iVar26 + -1 == 0)) {
                            (*(code *)(*pppppuVar20)[1])();
                          }
                          ppppppuVar36 = ppppppuVar36 + 1;
                        } while (ppppppuVar38 != ppppppuVar36);
                        ppppppuVar38 = pppppppuVar34[2];
                      }
                      if (ppppppuVar38 == (undefined8 ******)0x0) {
                        operator_delete(pppppppuVar34);
                        pppppppuVar34 = pppppppuVar40;
                      }
                      else {
                        operator_delete(ppppppuVar38);
                        operator_delete(pppppppuVar34);
                        pppppppuVar34 = pppppppuVar40;
                      }
                    }
                    local_a8 = &local_a8;
                    local_98 = 0;
                    local_a0 = local_a8;
                    std::
                    deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                    ::~deque((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                              *)&local_150);
                    std::
                    vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                    ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                             *)&local_170);
                    std::
                    vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                    ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                             *)&local_220);
                  }
                  if (local_c8 != local_e8) {
                    do {
                      lVar43 = *local_e8;
                      if (local_e8 == local_d8 + -3) {
                        operator_delete(plStack_e0);
                        local_e8 = (long *)plStack_d0[1];
                        local_d8 = local_e8 + 0x3f;
                        plStack_e0 = local_e8;
                        plStack_d0 = plStack_d0 + 1;
                      }
                      else {
                        local_e8 = local_e8 + 3;
                      }
                      *(byte *)(lVar43 + 0x58) = *(byte *)(lVar43 + 0x58) | 2;
                      plVar14 = (long *)(lVar43 + 0x28);
                      plVar19 = (long *)*plVar14;
                      if (plVar14 != plVar19) {
LAB_0032c680:
                        do {
                          lVar27 = plVar19[2];
                          local_220 = (long *)0x0;
                          plStack_218 = (long *)0x0;
                          local_260 = 0;
                          local_210 = 0;
                          local_2e0 = 0;
                          local_2f0 = lVar27;
                          lStack_2e8 = lVar27;
                          local_270 = lVar27;
                          lStack_268 = lVar27;
                    /* try { // try from 0032c6b8 to 0032c757 has its CatchHandler @ 0032d584 */
                          CGAL::
                          Gps_on_surface_base_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>,CGAL::Boolean_set_operation_2_internal::NoValidationPolicy>
                          ::construct_polygon(&local_2f0,&local_220,local_100);
                          lVar43 = lVar27;
                          do {
                            while( true ) {
                              uVar21 = *(ulong *)(*(long *)(lVar43 + 8) + 0x28);
                              if ((uVar21 & 1) != 0) {
                                uVar21 = uVar21 & 0xfffffffffffffffe;
                              }
                              lVar28 = *(long *)(uVar21 + 0x10);
                              if ((*(byte *)(lVar28 + 0x58) >> 1 & 1) != 0) break;
                              local_240 = 0;
                              local_300 = (Arrangement_on_surface_2 *)0x0;
                              local_250 = lVar28;
                              lStack_248 = lVar28;
                              local_310 = lVar28;
                              lStack_308 = lVar28;
                              CGAL::
                              Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                              ::all_incident_faces
                                        ((Arr_bfs_scanner<CGAL::Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>,CGAL::Oneset_iterator<CGAL::Polygon_with_holes_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                          *)&local_100,&local_310);
                              lVar43 = *(long *)(lVar43 + 0x18);
                              if (lVar27 == lVar43) goto LAB_0032c718;
                            }
                            lVar43 = *(long *)(lVar43 + 0x18);
                          } while (lVar27 != lVar43);
LAB_0032c718:
                          pppppppuVar34 = local_a8;
                          local_160 = 0;
                          plVar42 = (long *)0x0;
                          local_170 = (long *)0x0;
                          plStack_168 = (long *)0x0;
                          uVar21 = (long)plStack_218 - (long)local_220;
                          if ((long)uVar21 >> 3 != 0) {
                            if (0xfffffffffffffff < (ulong)((long)uVar21 >> 3)) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 0032d348 to 0032d34b has its CatchHandler @ 0032d584 */
                              std::__throw_bad_alloc();
                            }
                            plVar42 = operator_new(uVar21);
                          }
                          local_160 = (long)plVar42 + uVar21;
                          plVar17 = local_220;
                          plVar18 = plVar42;
                          plStack_168 = plVar42;
                          if (local_220 != plStack_218) {
                            do {
                              plVar25 = plVar17 + 1;
                              lVar43 = *plVar17;
                              *plVar18 = lVar43;
                              *(int *)(lVar43 + 8) = *(int *)(lVar43 + 8) + 1;
                              plVar17 = plVar25;
                              plVar18 = plVar18 + 1;
                            } while (plStack_218 != plVar25);
                            plStack_168 = (long *)((long)plVar42 +
                                                  ((long)plStack_218 - (long)local_220));
                          }
                          local_150 = (void *)0x0;
                          local_148 = 0;
                          local_140 = (long *)0x0;
                          uStack_138 = 0;
                          local_130 = (long *)0x0;
                          local_128 = (undefined8 *)0x0;
                          local_120 = (long *)0x0;
                          plStack_118 = (long *)0x0;
                          local_110 = 0;
                          local_108 = (undefined8 *)0x0;
                          local_170 = plVar42;
                    /* try { // try from 0032c7ec to 0032c7ef has its CatchHandler @ 0032d5c0 */
                          std::
                          deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                          ::
                          _M_range_initialize<std::_List_iterator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                    ((deque *)&local_150,pppppppuVar34,&local_a8,0);
                          pvVar7 = local_90;
                    /* try { // try from 0032c7fc to 0032c80b has its CatchHandler @ 0032d59c */
                          std::
                          vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                          ::operator=(local_90,(vector *)&local_170);
                          std::
                          deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                          ::operator=((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                       *)(pvVar7 + 0x20),(deque *)&local_150);
                          plVar42 = local_140;
                          plVar18 = local_130;
                          puVar41 = local_128;
                          plVar25 = local_120;
                          plVar17 = plStack_118;
                          puVar29 = local_108;
                          pppppppuVar34 = local_a8;
                          while (local_140 = plVar42, local_130 = plVar18, local_128 = puVar41,
                                local_120 = plVar25, plStack_118 = plVar17, local_108 = puVar29,
                                (undefined8 ********)pppppppuVar34 != &local_a8) {
                            ppppppuVar36 = pppppppuVar34[2];
                            pppppppuVar40 = (undefined8 *******)*pppppppuVar34;
                            ppppppuVar38 = pppppppuVar34[3];
                            if (ppppppuVar36 != ppppppuVar38) {
                              do {
                                pppppuVar20 = *ppppppuVar36;
                                if ((pppppuVar20 != (undefined8 *****)0x0) &&
                                   (iVar26 = *(int *)(pppppuVar20 + 1),
                                   *(int *)(pppppuVar20 + 1) = iVar26 + -1, iVar26 + -1 == 0)) {
                                  (*(code *)(*pppppuVar20)[1])();
                                }
                                ppppppuVar36 = ppppppuVar36 + 1;
                              } while (ppppppuVar38 != ppppppuVar36);
                              ppppppuVar38 = pppppppuVar34[2];
                            }
                            if (ppppppuVar38 == (undefined8 ******)0x0) {
                              operator_delete(pppppppuVar34);
                              plVar42 = local_140;
                              plVar18 = local_130;
                              puVar41 = local_128;
                              plVar25 = local_120;
                              plVar17 = plStack_118;
                              puVar29 = local_108;
                              pppppppuVar34 = pppppppuVar40;
                            }
                            else {
                              operator_delete(ppppppuVar38);
                              operator_delete(pppppppuVar34);
                              plVar42 = local_140;
                              plVar18 = local_130;
                              puVar41 = local_128;
                              plVar25 = local_120;
                              plVar17 = plStack_118;
                              puVar29 = local_108;
                              pppppppuVar34 = pppppppuVar40;
                            }
                          }
                          local_a8 = &local_a8;
                          local_98 = 0;
                          local_a0 = local_a8;
                          puVar35 = puVar41;
joined_r0x0032c8d0:
                          puVar35 = puVar35 + 1;
                          if (puVar35 < puVar29) {
                            plVar37 = (long *)*puVar35;
                            plVar24 = plVar37 + 0x40;
                            do {
                              while( true ) {
                                plVar23 = (long *)*plVar37;
                                plVar39 = (long *)plVar37[1];
                                if (plVar23 != plVar39) {
                                  do {
                                    plVar22 = (long *)*plVar23;
                                    if ((plVar22 != (long *)0x0) &&
                                       (iVar26 = (int)plVar22[1] + -1,
                                       *(int *)(plVar22 + 1) = iVar26, iVar26 == 0)) {
                                      (**(code **)(*plVar22 + 8))();
                                    }
                                    plVar23 = plVar23 + 1;
                                  } while (plVar39 != plVar23);
                                  plVar39 = (long *)*plVar37;
                                }
                                if (plVar39 == (long *)0x0) break;
                                plVar37 = plVar37 + 4;
                                operator_delete(plVar39);
                                if (plVar37 == plVar24) goto joined_r0x0032c8d0;
                              }
                              plVar37 = plVar37 + 4;
                            } while (plVar37 != plVar24);
                            goto joined_r0x0032c8d0;
                          }
                          if (puVar41 == puVar29) {
                            for (; plVar42 != plVar25; plVar42 = plVar42 + 4) {
                              while( true ) {
                                plVar17 = (long *)*plVar42;
                                plVar18 = (long *)plVar42[1];
                                if (plVar17 != plVar18) {
                                  do {
                                    plVar24 = (long *)*plVar17;
                                    if ((plVar24 != (long *)0x0) &&
                                       (iVar26 = (int)plVar24[1] + -1,
                                       *(int *)(plVar24 + 1) = iVar26, iVar26 == 0)) {
                                      (**(code **)(*plVar24 + 8))();
                                    }
                                    plVar17 = plVar17 + 1;
                                  } while (plVar18 != plVar17);
                                  plVar18 = (long *)*plVar42;
                                }
                                if (plVar18 == (long *)0x0) break;
                                plVar42 = plVar42 + 4;
                                operator_delete(plVar18);
                                if (plVar25 == plVar42) goto LAB_0032ca74;
                              }
                            }
                          }
                          else {
                            for (; plVar42 != plVar18; plVar42 = plVar42 + 4) {
                              while( true ) {
                                plVar24 = (long *)*plVar42;
                                plVar37 = (long *)plVar42[1];
                                if (plVar24 != plVar37) {
                                  do {
                                    plVar23 = (long *)*plVar24;
                                    if ((plVar23 != (long *)0x0) &&
                                       (iVar26 = (int)plVar23[1] + -1,
                                       *(int *)(plVar23 + 1) = iVar26, iVar26 == 0)) {
                                      (**(code **)(*plVar23 + 8))();
                                    }
                                    plVar24 = plVar24 + 1;
                                  } while (plVar37 != plVar24);
                                  plVar37 = (long *)*plVar42;
                                }
                                if (plVar37 == (long *)0x0) break;
                                plVar42 = plVar42 + 4;
                                operator_delete(plVar37);
                                if (plVar18 == plVar42) goto joined_r0x0032ca10;
                              }
                            }
joined_r0x0032ca10:
                            while (plVar25 != plVar17) {
                              plVar42 = (long *)*plVar17;
                              plVar18 = *(long **)((long)plVar17 + 8);
                              if (plVar42 != plVar18) {
                                do {
                                  plVar24 = (long *)*plVar42;
                                  if ((plVar24 != (long *)0x0) &&
                                     (iVar26 = (int)plVar24[1] + -1, *(int *)(plVar24 + 1) = iVar26,
                                     iVar26 == 0)) {
                                    (**(code **)(*plVar24 + 8))();
                                  }
                                  plVar42 = plVar42 + 1;
                                } while (plVar18 != plVar42);
                                plVar18 = (long *)*plVar17;
                              }
                              if (plVar18 == (long *)0x0) {
                                plVar17 = (long *)((long)plVar17 + 0x20);
                              }
                              else {
                                plVar17 = (long *)((long)plVar17 + 0x20);
                                operator_delete(plVar18);
                              }
                            }
                          }
LAB_0032ca74:
                          plVar42 = local_170;
                          plVar17 = plStack_168;
                          plVar18 = plStack_168;
                          if (local_150 != (void *)0x0) {
                            puVar41 = local_108 + 1;
                            for (puVar29 = local_128; puVar29 < puVar41; puVar29 = puVar29 + 1) {
                              operator_delete((void *)*puVar29);
                            }
                            operator_delete(local_150);
                            plVar42 = local_170;
                            plVar17 = plStack_168;
                            plVar18 = plStack_168;
                          }
                          for (; plVar25 = plStack_168, plVar42 != plStack_168;
                              plVar42 = plVar42 + 1) {
                            plVar17 = (long *)*plVar42;
                            plStack_168 = plVar18;
                            if ((plVar17 != (long *)0x0) &&
                               (iVar26 = (int)plVar17[1] + -1, *(int *)(plVar17 + 1) = iVar26,
                               iVar26 == 0)) {
                              (**(code **)(*plVar17 + 8))();
                            }
                            plVar17 = local_170;
                            plVar18 = plStack_168;
                            plStack_168 = plVar25;
                          }
                          plVar42 = local_220;
                          plVar25 = plStack_218;
                          plVar24 = plStack_218;
                          plStack_168 = plVar18;
                          if (plVar17 != (long *)0x0) {
                            operator_delete(plVar17);
                            plVar42 = local_220;
                            plVar25 = plStack_218;
                            plVar24 = plStack_218;
                          }
                          for (; plVar17 = plStack_218, plVar42 != plStack_218;
                              plVar42 = plVar42 + 1) {
                            plVar18 = (long *)*plVar42;
                            plStack_218 = plVar24;
                            if ((plVar18 != (long *)0x0) &&
                               (iVar26 = (int)plVar18[1] + -1, *(int *)(plVar18 + 1) = iVar26,
                               iVar26 == 0)) {
                              (**(code **)(*plVar18 + 8))();
                            }
                            plVar25 = local_220;
                            plVar24 = plStack_218;
                            plStack_218 = plVar17;
                          }
                          if (plVar25 == (long *)0x0) {
                            plVar19 = (long *)*plVar19;
                            plStack_218 = plVar24;
                            if (plVar14 == plVar19) break;
                            goto LAB_0032c680;
                          }
                          plStack_218 = plVar24;
                          operator_delete(plVar25);
                          plVar19 = (long *)*plVar19;
                        } while (plVar14 != plVar19);
                      }
                    } while (local_c8 != local_e8);
                  }
                  lVar43 = *(long *)(pAVar16 + 0x48);
                  local_380 = *(long *)(local_380 + 0x68);
                } while (local_380 != lVar43);
LAB_0032cb84:
                lVar11 = *(long *)(local_380 + 0x68);
                if (lVar11 != local_380) {
                  do {
                    *(byte *)(lVar11 + 0x58) = *(byte *)(lVar11 + 0x58) & 0xfd;
                    lVar11 = *(long *)(lVar11 + 0x68);
                  } while (*(long *)(pAVar16 + 0x48) != lVar11);
                }
                pppppppuVar34 = local_a8;
                while ((undefined8 ********)pppppppuVar34 != &local_a8) {
                  ppppppuVar36 = pppppppuVar34[2];
                  pppppppuVar40 = (undefined8 *******)*pppppppuVar34;
                  ppppppuVar38 = pppppppuVar34[3];
                  if (ppppppuVar36 != ppppppuVar38) {
                    do {
                      pppppuVar20 = *ppppppuVar36;
                      if ((pppppuVar20 != (undefined8 *****)0x0) &&
                         (iVar26 = *(int *)(pppppuVar20 + 1),
                         *(int *)(pppppuVar20 + 1) = iVar26 + -1, iVar26 + -1 == 0)) {
                        (*(code *)(*pppppuVar20)[1])();
                      }
                      ppppppuVar36 = ppppppuVar36 + 1;
                    } while (ppppppuVar38 != ppppppuVar36);
                    ppppppuVar38 = pppppppuVar34[2];
                  }
                  if (ppppppuVar38 == (undefined8 ******)0x0) {
                    operator_delete(pppppppuVar34);
                    pppppppuVar34 = pppppppuVar40;
                  }
                  else {
                    operator_delete(ppppppuVar38);
                    operator_delete(pppppppuVar34);
                    pppppppuVar34 = pppppppuVar40;
                  }
                }
              }
              if (local_f8 != (undefined *)0x0) {
                plVar14 = (long *)(lStack_b0 + 8);
                for (plVar19 = plStack_d0; plVar19 < plVar14; plVar19 = plVar19 + 1) {
                  operator_delete((void *)*plVar19);
                }
                operator_delete(local_f8);
              }
              bVar10 = true;
            }
            pAVar16 = local_1e8;
            local_200 = PTR_vtable_004de7e0 + 0x10;
            if (local_1e8 !=
                (Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                 *)0x0) {
              if (*(code **)(*(long *)local_1e8 + 8) ==
                  (code *)PTR__Arrangement_on_surface_2_004de980) {
                CGAL::
                Arrangement_on_surface_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Arr_bounded_planar_topology_traits_2<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>,CGAL::Gps_default_dcel<CGAL::Gps_segment_traits_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,CGAL::Arr_segment_traits_2<CGAL::Epeck>>>>>
                ::~Arrangement_on_surface_2(local_1e8);
                operator_delete(pAVar16,0xf0);
              }
              else {
                (**(code **)(*(long *)local_1e8 + 8))();
              }
            }
            if ((local_1ef != '\0') && (local_1f8 != (undefined *)0x0)) {
              operator_delete(local_1f8,1);
            }
            plVar19 = local_1b0;
            plVar42 = local_1a0;
            puVar29 = local_198;
            plVar17 = local_190;
            plVar18 = plStack_188;
            puVar35 = local_178;
            puVar41 = local_198;
            plVar25 = local_1b0;
            plVar24 = local_1a0;
            puVar8 = local_198;
            plVar37 = local_190;
            plVar14 = plStack_188;
            puVar9 = local_178;
            if (bVar10) {
                    /* try { // try from 0032ba58 to 0032ba77 has its CatchHandler @ 0032d4a8 */
              std::deque<int,std::allocator<int>>::emplace_back<unsigned_long&>
                        ((deque<int,std::allocator<int>> *)(*in_x8 + local_2c0 * 0x60 + 8),
                         &local_2b8);
              std::deque<int,std::allocator<int>>::emplace_back<unsigned_long&>
                        ((deque<int,std::allocator<int>> *)(*in_x8 + local_2b8 * 0x60 + 8),
                         &local_2c0);
              plVar19 = local_1b0;
              plVar42 = local_1a0;
              puVar29 = local_198;
              plVar17 = local_190;
              plVar18 = plStack_188;
              puVar35 = local_178;
              puVar41 = local_198;
              plVar25 = local_1b0;
              plVar24 = local_1a0;
              puVar8 = local_198;
              plVar37 = local_190;
              plVar14 = plStack_188;
              puVar9 = local_178;
            }
          }
joined_r0x0032ba98:
          local_178 = puVar9;
          plStack_188 = plVar14;
          local_190 = plVar37;
          local_198 = puVar8;
          local_1a0 = plVar24;
          local_1b0 = plVar25;
          puVar9 = local_178;
          plVar14 = plStack_188;
          plVar37 = local_190;
          puVar8 = local_198;
          plVar24 = local_1a0;
          plVar25 = local_1b0;
          puVar41 = puVar41 + 1;
          local_1a0 = plVar42;
          local_190 = plVar17;
          plStack_188 = plVar18;
          if (puVar41 < local_178) {
            plVar39 = (long *)*puVar41;
            plVar23 = plVar39 + 0x40;
            local_1b0 = plVar19;
            local_198 = puVar29;
            local_178 = puVar35;
            do {
              while( true ) {
                plVar19 = (long *)*plVar39;
                plVar42 = (long *)plVar39[1];
                if (plVar19 != plVar42) {
                  do {
                    plVar17 = (long *)*plVar19;
                    if ((plVar17 != (long *)0x0) &&
                       (iVar26 = (int)plVar17[1] + -1, *(int *)(plVar17 + 1) = iVar26, iVar26 == 0))
                    {
                      (**(code **)(*plVar17 + 8))();
                    }
                    plVar19 = plVar19 + 1;
                  } while (plVar42 != plVar19);
                  plVar42 = (long *)*plVar39;
                }
                if (plVar42 == (long *)0x0) break;
                plVar39 = plVar39 + 4;
                operator_delete(plVar42);
                plVar19 = local_1b0;
                plVar42 = local_1a0;
                puVar29 = local_198;
                plVar17 = local_190;
                plVar18 = plStack_188;
                puVar35 = local_178;
                if (plVar23 == plVar39) goto joined_r0x0032ba98;
              }
              plVar39 = plVar39 + 4;
              plVar19 = local_1b0;
              plVar42 = local_1a0;
              puVar29 = local_198;
              plVar17 = local_190;
              plVar18 = plStack_188;
              puVar35 = local_178;
            } while (plVar39 != plVar23);
            goto joined_r0x0032ba98;
          }
          bVar10 = local_198 == local_178;
          local_198 = puVar29;
          local_178 = puVar35;
          plVar42 = local_1b0;
          if (bVar10) {
            for (; local_1b0 = plVar19, plVar42 != plVar37; plVar42 = plVar42 + 4) {
              while( true ) {
                plVar14 = (long *)*plVar42;
                plVar19 = (long *)plVar42[1];
                if (plVar14 != plVar19) {
                  do {
                    plVar17 = (long *)*plVar14;
                    if ((plVar17 != (long *)0x0) &&
                       (iVar26 = (int)plVar17[1] + -1, *(int *)(plVar17 + 1) = iVar26, iVar26 == 0))
                    {
                      (**(code **)(*plVar17 + 8))();
                    }
                    plVar14 = plVar14 + 1;
                  } while (plVar19 != plVar14);
                  plVar19 = (long *)*plVar42;
                }
                if (plVar19 == (long *)0x0) break;
                plVar42 = plVar42 + 4;
                operator_delete(plVar19);
                if (plVar37 == plVar42) goto LAB_0032bbec;
              }
              plVar19 = local_1b0;
            }
          }
          else {
            for (; local_1b0 = plVar19, plVar42 != plVar24; plVar42 = plVar42 + 4) {
              while( true ) {
                plVar19 = (long *)*plVar42;
                plVar17 = (long *)plVar42[1];
                if (plVar19 != plVar17) {
                  do {
                    plVar18 = (long *)*plVar19;
                    if ((plVar18 != (long *)0x0) &&
                       (iVar26 = (int)plVar18[1] + -1, *(int *)(plVar18 + 1) = iVar26, iVar26 == 0))
                    {
                      (**(code **)(*plVar18 + 8))();
                    }
                    plVar19 = plVar19 + 1;
                  } while (plVar17 != plVar19);
                  plVar17 = (long *)*plVar42;
                }
                if (plVar17 == (long *)0x0) break;
                plVar42 = plVar42 + 4;
                operator_delete(plVar17);
                if (plVar24 == plVar42) goto joined_r0x0032bb88;
              }
              plVar19 = local_1b0;
            }
joined_r0x0032bb88:
            while (plVar37 != plVar14) {
              plVar19 = (long *)*plVar14;
              plVar42 = *(long **)((long)plVar14 + 8);
              if (plVar19 != plVar42) {
                do {
                  plVar17 = (long *)*plVar19;
                  if ((plVar17 != (long *)0x0) &&
                     (iVar26 = (int)plVar17[1] + -1, *(int *)(plVar17 + 1) = iVar26, iVar26 == 0)) {
                    (**(code **)(*plVar17 + 8))();
                  }
                  plVar19 = plVar19 + 1;
                } while (plVar42 != plVar19);
                plVar42 = (long *)*plVar14;
              }
              if (plVar42 == (long *)0x0) {
                plVar14 = (long *)((long)plVar14 + 0x20);
              }
              else {
                plVar14 = (long *)((long)plVar14 + 0x20);
                operator_delete(plVar42);
              }
            }
          }
LAB_0032bbec:
          plVar14 = local_1e0;
          plVar19 = plStack_1d8;
          plVar42 = plStack_1d8;
          if (local_1c0 != (void *)0x0) {
            puVar41 = local_178 + 1;
            for (puVar29 = local_198; puVar29 < puVar41; puVar29 = puVar29 + 1) {
              operator_delete((void *)*puVar29);
            }
            operator_delete(local_1c0);
            plVar14 = local_1e0;
            plVar19 = plStack_1d8;
            plVar42 = plStack_1d8;
          }
          for (; plVar17 = plStack_1d8, plVar14 != plStack_1d8; plVar14 = plVar14 + 1) {
            plVar19 = (long *)*plVar14;
            plStack_1d8 = plVar42;
            if ((plVar19 != (long *)0x0) &&
               (iVar26 = (int)plVar19[1] + -1, *(int *)(plVar19 + 1) = iVar26, iVar26 == 0)) {
              (**(code **)(*plVar19 + 8))();
            }
            plVar19 = local_1e0;
            plVar42 = plStack_1d8;
            plStack_1d8 = plVar17;
          }
          plStack_1d8 = plVar42;
          if (plVar19 != (long *)0x0) {
            operator_delete(plVar19);
          }
          local_2b8 = local_2b8 + 1;
          lVar11 = *(long *)(param_1 + 8) - *(long *)param_1;
          uVar21 = lVar11 >> 5;
        } while (local_2b8 < uVar21);
        uVar31 = local_2c0 + 1;
      }
      local_2c0 = uVar31;
    } while (uVar31 < uVar21 - 1);
    iVar26 = (int)uVar21 + -1;
    puVar33 = (undefined1 *)in_x8[1];
  }
  *(int *)(puVar33 + -8) = iVar26;
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(PTR___stack_chk_guard_004de1a8,
                     local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return in_x8;
}



// ===== polygon_coverage_planning::checkObservability @ 0036c3c8 =====

/* polygon_coverage_planning::checkObservability(CGAL::Segment_2<CGAL::Epeck> const&,
   CGAL::Segment_2<CGAL::Epeck> const&, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > const&,
   CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,
   (boost::multiprecision::expression_template_option)1> >,
   __gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck> const*,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > >*) */

void polygon_coverage_planning::checkObservability
               (Point_2 *param_1,Segment_2 *param_2,long *param_3,Lazy_exact_nt *param_4,
               long *param_5)

{
  int iVar1;
  bool bVar2;
  bool bVar3;
  int iVar4;
  long lVar5;
  Lazy_exact_nt *pLVar6;
  internal *this;
  Segment_2 aSStack_68 [8];
  long *local_60 [2];
  undefined8 local_50;
  double local_40;
  double dStack_38;
  undefined1 local_30;
  undefined7 uStack_2f;
  double local_28;
  double dStack_20;
  Lazy_exact_nt *local_18;
  undefined1 local_10;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  *param_5 = param_3[1];
  this = (internal *)*param_3;
  if ((internal *)param_3[1] != this) {
    pLVar6 = param_4;
    do {
      CGAL::
      Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
      ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                    *)&local_50,(Segment_2 *)param_1);
      local_28 = -(double)local_60[0][2];
      bVar3 = (double)local_60[0][3] != local_28;
      if (bVar3) {
        local_28 = 0.0;
      }
      dStack_20 = -(double)local_60[0][4];
      bVar2 = (double)local_60[0][5] != dStack_20;
      if (bVar2) {
        dStack_20 = 0.0;
      }
      local_18 = (Lazy_exact_nt *)-(double)local_60[0][6];
      if ((((double)local_60[0][7] != (double)local_18) || (bVar3)) || (bVar2)) {
        pLVar6 = (Lazy_exact_nt *)CONCAT71(uStack_2f,local_30);
        local_28 = local_40;
        dStack_20 = dStack_38;
        local_10 = 0;
        local_18 = pLVar6;
                    /* try { // try from 0036c6a8 to 0036c6ab has its CatchHandler @ 0036c7c4 */
        iVar4 = CGAL::
                Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                              *)&local_50,(Line_2 *)local_60,(Point_2 *)this);
      }
      else {
        lVar5 = *(long *)this;
        local_10 = 1;
        local_40 = -*(double *)(lVar5 + 0x10);
        if ((*(double *)(lVar5 + 0x18) == local_40) &&
           (dStack_38 = -*(double *)(lVar5 + 0x20), *(double *)(lVar5 + 0x28) == dStack_38)) {
          local_30 = 1;
                    /* try { // try from 0036c484 to 0036c487 has its CatchHandler @ 0036c7c4 */
          iVar4 = CGAL::
                  Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                  ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                                *)((long)&local_50 + 4),(Line_2 *)&local_28,(Point_2 *)&local_40);
        }
        else {
          local_40 = 0.0;
          dStack_38 = 0.0;
          local_30 = 0;
                    /* try { // try from 0036c6ec to 0036c6ef has its CatchHandler @ 0036c7c4 */
          iVar4 = CGAL::
                  Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                  ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                *)&local_50,(Line_2 *)local_60,(Point_2 *)this);
        }
      }
      if ((local_60[0] != (long *)0x0) &&
         (iVar1 = (int)local_60[0][1] + -1, *(int *)(local_60[0] + 1) = iVar1, iVar1 == 0)) {
        (**(code **)(*local_60[0] + 8))();
      }
      if (iVar4 != 1) {
        CGAL::
        Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
        ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                      *)&local_50,param_2);
        local_28 = -(double)local_60[0][2];
        bVar3 = (double)local_60[0][3] != local_28;
        if (bVar3) {
          local_28 = 0.0;
        }
        dStack_20 = -(double)local_60[0][4];
        bVar2 = (double)local_60[0][5] != dStack_20;
        if (bVar2) {
          dStack_20 = 0.0;
        }
        local_18 = (Lazy_exact_nt *)-(double)local_60[0][6];
        if ((((double)local_60[0][7] != (double)local_18) || (bVar3)) || (bVar2)) {
          pLVar6 = (Lazy_exact_nt *)CONCAT71(uStack_2f,local_30);
          local_28 = local_40;
          dStack_20 = dStack_38;
          local_10 = 0;
          local_18 = pLVar6;
                    /* try { // try from 0036c6d0 to 0036c6d3 has its CatchHandler @ 0036c7f4 */
          iVar4 = CGAL::
                  Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                  ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                *)&local_50,(Line_2 *)local_60,(Point_2 *)this);
        }
        else {
          lVar5 = *(long *)this;
          local_10 = 1;
          local_40 = -*(double *)(lVar5 + 0x10);
          if ((*(double *)(lVar5 + 0x18) == local_40) &&
             (dStack_38 = -*(double *)(lVar5 + 0x20), *(double *)(lVar5 + 0x28) == dStack_38)) {
            local_30 = 1;
                    /* try { // try from 0036c560 to 0036c563 has its CatchHandler @ 0036c7f4 */
            iVar4 = CGAL::
                    Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                    ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                                  *)((long)&local_50 + 4),(Line_2 *)&local_28,(Point_2 *)&local_40);
          }
          else {
            local_40 = 0.0;
            dStack_38 = 0.0;
            local_30 = 0;
                    /* try { // try from 0036c708 to 0036c70b has its CatchHandler @ 0036c7f4 */
            iVar4 = CGAL::
                    Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                    ::operator()((Filtered_predicate<CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Oriented_side_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                  *)&local_50,(Line_2 *)local_60,(Point_2 *)this);
          }
        }
        if ((local_60[0] != (long *)0x0) &&
           (iVar1 = (int)local_60[0][1] + -1, *(int *)(local_60[0] + 1) = iVar1, iVar1 == 0)) {
          (**(code **)(*local_60[0] + 8))();
        }
        if (iVar4 == -1) break;
        CGAL::internal::squared_distance<CGAL::Epeck>
                  (this,param_1,(Segment_2 *)&local_50,(Epeck *)pLVar6);
                    /* try { // try from 0036c5bc to 0036c5bf has its CatchHandler @ 0036c7f8 */
        CGAL::internal::squared_distance<CGAL::Epeck>
                  (this,(Point_2 *)param_2,aSStack_68,(Epeck *)pLVar6);
                    /* try { // try from 0036c5c8 to 0036c5cb has its CatchHandler @ 0036c828 */
        bVar3 = CGAL::operator<(param_4,(Lazy_exact_nt *)local_60);
                    /* try { // try from 0036c718 to 0036c71b has its CatchHandler @ 0036c828 */
        if ((bVar3) && (bVar3 = CGAL::operator<(param_4,(Lazy_exact_nt *)&local_50), bVar3)) {
          *param_5 = (long)this;
          if ((local_50 != (long *)0x0) &&
             (iVar4 = (int)local_50[1] + -1, *(int *)(local_50 + 1) = iVar4, iVar4 == 0)) {
            (**(code **)(*local_50 + 8))();
          }
          if ((local_60[0] != (long *)0x0) &&
             (iVar4 = (int)local_60[0][1] + -1, *(int *)(local_60[0] + 1) = iVar4, iVar4 == 0)) {
            (**(code **)(*local_60[0] + 8))();
          }
          break;
        }
        if ((local_50 != (long *)0x0) &&
           (iVar4 = (int)local_50[1] + -1, *(int *)(local_50 + 1) = iVar4, iVar4 == 0)) {
          (**(code **)(*local_50 + 8))();
        }
        if ((local_60[0] != (long *)0x0) &&
           (iVar4 = (int)local_60[0][1] + -1, *(int *)(local_60[0] + 1) = iVar4, iVar4 == 0)) {
          (**(code **)(*local_60[0] + 8))();
        }
      }
      this = this + 8;
    } while ((internal *)param_3[1] != this);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== polygon_coverage_planning::computeSweep @ 0036f5b0 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* polygon_coverage_planning::computeSweep(CGAL::Polygon_2<CGAL::Epeck,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > > const&,
   polygon_coverage_planning::visibility_graph::VisibilityGraph const&,
   CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,
   (boost::multiprecision::expression_template_option)1> >, CGAL::Direction_2<CGAL::Epeck> const&,
   bool, std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > >*) */

bool polygon_coverage_planning::computeSweep
               (polygon_coverage_planning *param_1,VisibilityGraph *param_2,Lazy_exact_nt *param_3,
               Line_2 *param_4,byte param_5,
               vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
               *param_6)

{
  uint uVar1;
  byte bVar2;
  long *plVar3;
  undefined8 *puVar4;
  long *plVar5;
  uint uVar6;
  undefined8 uVar7;
  bool bVar8;
  byte bVar9;
  char cVar10;
  int iVar11;
  uint uVar12;
  long *plVar13;
  Lazy_exact_nt *pLVar14;
  Lazy_exact_nt *pLVar15;
  long lVar16;
  long lVar17;
  long *plVar18;
  undefined *puVar19;
  ostream *poVar20;
  Lazy_exact_nt *extraout_x1;
  Lazy_exact_nt *extraout_x1_00;
  Segment_2 *pSVar21;
  Segment_2 *extraout_x1_01;
  Segment_2 *extraout_x1_02;
  Segment_2 *extraout_x1_03;
  Segment_2 *extraout_x1_04;
  Segment_2 *extraout_x1_05;
  Segment_2 *extraout_x1_06;
  Segment_2 *extraout_x1_07;
  undefined **ppuVar22;
  undefined *puVar23;
  Epeck *pEVar24;
  undefined **ppuVar25;
  double dVar26;
  double dVar27;
  undefined1 auVar28 [16];
  int local_218;
  long *local_1a8;
  long *local_1a0;
  long *local_198;
  long *local_190;
  long *local_188;
  long *local_180;
  long *local_178;
  long *local_170;
  long *local_168;
  long *local_160;
  long *local_158;
  long *local_150;
  long *local_148;
  long *local_140 [2];
  Direction_2 *local_130 [2];
  undefined8 local_120;
  long local_118;
  undefined8 local_110;
  Direction_2 *local_100;
  Direction_2 *local_f8;
  double local_88;
  double dStack_80;
  double local_78;
  double dStack_70;
  double local_48;
  double dStack_40;
  double local_38;
  double dStack_30;
  undefined1 local_28;
  long local_8;
  
  plVar3 = *(long **)param_6;
  plVar5 = *(long **)(param_6 + 8);
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  plVar18 = plVar3;
  if (plVar3 != plVar5) {
    do {
      plVar13 = (long *)*plVar18;
      if ((plVar13 != (long *)0x0) &&
         (iVar11 = (int)plVar13[1] + -1, *(int *)(plVar13 + 1) = iVar11, iVar11 == 0)) {
        (**(code **)(*plVar13 + 8))();
      }
      plVar18 = plVar18 + 1;
    } while (plVar5 != plVar18);
    *(long **)(param_6 + 8) = plVar3;
  }
  pLVar14 = ::operator_new(0x48);
  CGAL::
  Lazy_exact_Mul<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>
  ::Lazy_exact_Mul(pLVar14,param_3);
                    /* try { // try from 0036f65c to 0036f65f has its CatchHandler @ 00370aec */
  iVar11 = CGAL::
           orientation_2<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>const*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,CGAL::Epeck>
                     (*(undefined8 *)param_1,*(undefined8 *)(param_1 + 8),param_1 + 0x18);
  bVar8 = false;
  if (iVar11 == 1) {
    uVar7 = fpcr;
    fpcr = 0x400000;
                    /* try { // try from 0036f6ec to 0036f6ef has its CatchHandler @ 003706e4 */
    local_100 = ::operator_new(0x48);
    *(long *)(local_100 + 0x30) = 0;
    puVar19 = PTR_vtable_004de760;
    lVar16 = DAT_00459178;
    lVar17 = _DAT_00459170;
    *(undefined4 *)(local_100 + 8) = 1;
    *(long *)(local_100 + 0x18) = lVar16;
    *(long *)(local_100 + 0x10) = lVar17;
    *(long *)(local_100 + 0x28) = lVar16;
    *(long *)(local_100 + 0x20) = lVar17;
    *(undefined **)local_100 = puVar19 + 0x10;
    *(long *)(local_100 + 0x38) = 0;
    *(long *)(local_100 + 0x40) = 0;
    fpcr = uVar7;
                    /* try { // try from 0036f73c to 0036f73f has its CatchHandler @ 00370824 */
    CGAL::Line_2<CGAL::Epeck>::Line_2((Point_2 *)&local_1a8,(Direction_2 *)&local_100);
    if ((local_100 != (Direction_2 *)0x0) &&
       (iVar11 = *(int *)(local_100 + 8), *(int *)(local_100 + 8) = iVar11 + -1, iVar11 + -1 == 0))
    {
      (**(code **)(*(long *)local_100 + 8))();
    }
                    /* try { // try from 0036f764 to 0036f767 has its CatchHandler @ 00370b84 */
    sortVerticesToLine(param_1,(Polygon_2 *)&local_1a8,param_4);
                    /* try { // try from 0036f778 to 0036f7bb has its CatchHandler @ 00370b8c */
    CGAL::Line_2<CGAL::Epeck>::Line_2((Point_2 *)&local_1a0,local_100);
    CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)&local_1a0);
    if ((local_1a0 != (long *)0x0) &&
       (iVar11 = (int)local_1a0[1] + -1, *(int *)(local_1a0 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_1a0 + 8))();
    }
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_perpendicular_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_perpendicular_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Line_2 *)local_130,(Point_2 *)&local_1a8);
                    /* try { // try from 0036f7cc to 0036f7cf has its CatchHandler @ 00370bcc */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                  *)local_130,(Line_2 *)&local_120);
    if ((local_120 != (Lazy_exact_nt *)0x0) &&
       (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1, iVar11 + -1 == 0))
    {
      (**(code **)(*(long *)local_120 + 8))();
    }
                    /* try { // try from 0036f7fc to 0036f7ff has its CatchHandler @ 00370bbc */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_scaled_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_scaled_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Vector_2 *)&local_120,(Lazy_exact_nt *)&local_198);
                    /* try { // try from 0036f80c to 0036f80f has its CatchHandler @ 00370bc4 */
    CGAL::
    Lazy_construction_nt<CGAL::Epeck,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
    ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                  *)&local_120,(Vector_2 *)&local_198);
                    /* try { // try from 0036f814 to 0036f82b has its CatchHandler @ 00370b94 */
    dVar26 = (double)CGAL::
                     Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                     ::To_double::operator()((To_double *)local_130,extraout_x1);
    dVar27 = SQRT(dVar26);
    if (dVar26 < 0.0) {
      sqrt(dVar26);
    }
    local_120 = ::operator_new(0x30);
    puVar19 = PTR_vtable_004de288;
    *(undefined4 *)((long)local_120 + 8) = 1;
    *(long *)((long)local_120 + 0x20) = 0;
    *(undefined **)local_120 = puVar19 + 0x10;
    *(double *)((long)local_120 + 0x10) = -dVar27;
    *(double *)((long)local_120 + 0x18) = dVar27;
    *(double *)((long)local_120 + 0x28) = dVar27;
                    /* try { // try from 0036f874 to 0036f877 has its CatchHandler @ 00370a74 */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_divided_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_divided_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Vector_2 *)&local_148,(Lazy_exact_nt *)local_140);
    CGAL::Handle::operator=((Handle *)&local_198,(Handle *)&local_190);
    if ((local_190 != (long *)0x0) &&
       (iVar11 = (int)local_190[1] + -1, *(int *)(local_190 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_190 + 8))();
    }
    if ((local_120 != (Lazy_exact_nt *)0x0) &&
       (iVar11 = (int)*(long *)((long)local_120 + 8) + -1, *(int *)((long)local_120 + 8) = iVar11,
       iVar11 == 0)) {
      (**(code **)(*(long *)local_120 + 8))();
    }
    if ((local_130[0] != (Direction_2 *)0x0) &&
       (iVar11 = *(int *)(local_130[0] + 8), *(int *)(local_130[0] + 8) = iVar11 + -1,
       iVar11 + -1 == 0)) {
      (**(code **)(*(long *)local_130[0] + 8))();
    }
    if ((local_140[0] != (long *)0x0) &&
       (iVar11 = (int)local_140[0][1] + -1, *(int *)(local_140[0] + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_140[0] + 8))();
    }
                    /* try { // try from 0036f8f4 to 0036f8f7 has its CatchHandler @ 00370bbc */
    CGAL::Aff_transformationC2<CGAL::Epeck>::Aff_transformationC2
              ((Aff_transformationC2<CGAL::Epeck> *)&local_188,0,(Handle *)&local_198);
    local_140[0] = *(long **)param_3;
    *(int *)(local_140[0] + 1) = (int)local_140[0][1] + 1;
                    /* try { // try from 0036f910 to 0036f913 has its CatchHandler @ 00370bb4 */
    local_130[0] = ::operator_new(0x30);
    puVar19 = PTR_vtable_004de288;
    lVar16 = _UNK_00460ae8;
    lVar17 = _DAT_00460ae0;
    *(undefined4 *)(local_130[0] + 8) = 1;
    *(long *)(local_130[0] + 0x20) = 0;
    *(undefined **)local_130[0] = puVar19 + 0x10;
    *(long *)(local_130[0] + 0x18) = lVar16;
    *(long *)(local_130[0] + 0x10) = lVar17;
    *(long *)(local_130[0] + 0x28) = 0x3fe3333333333333;
                    /* try { // try from 0036f958 to 0036f95b has its CatchHandler @ 00370960 */
    pLVar15 = ::operator_new(0x48);
    CGAL::
    Lazy_exact_Mul<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>
    ::Lazy_exact_Mul(pLVar15,(Lazy_exact_nt *)local_140);
    local_120 = pLVar15;
    CGAL::Handle::operator=((Handle *)local_140,(Handle *)&local_120);
    if ((local_120 != (Lazy_exact_nt *)0x0) &&
       (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1, iVar11 + -1 == 0))
    {
      (**(code **)(*(long *)local_120 + 8))();
    }
    if ((local_130[0] != (Direction_2 *)0x0) &&
       (iVar11 = *(int *)(local_130[0] + 8), *(int *)(local_130[0] + 8) = iVar11 + -1,
       iVar11 + -1 == 0)) {
      (**(code **)(*(long *)local_130[0] + 8))();
    }
                    /* try { // try from 0036f9bc to 0036f9bf has its CatchHandler @ 00370b9c */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_perpendicular_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_perpendicular_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Line_2 *)local_130,(Point_2 *)&local_1a8);
                    /* try { // try from 0036f9d0 to 0036f9d3 has its CatchHandler @ 00370ba4 */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                  *)local_130,(Line_2 *)&local_120);
    if ((local_120 != (Lazy_exact_nt *)0x0) &&
       (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1, iVar11 + -1 == 0))
    {
      (**(code **)(*(long *)local_120 + 8))();
    }
                    /* try { // try from 0036f9fc to 0036f9ff has its CatchHandler @ 00370990 */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_scaled_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_scaled_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Vector_2 *)&local_120,(Lazy_exact_nt *)&local_180);
                    /* try { // try from 0036fa0c to 0036fa0f has its CatchHandler @ 003709ec */
    CGAL::
    Lazy_construction_nt<CGAL::Epeck,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
    ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Compute_squared_length_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                  *)&local_120,(Vector_2 *)&local_180);
                    /* try { // try from 0036fa14 to 0036fa2b has its CatchHandler @ 00370a18 */
    dVar26 = (double)CGAL::
                     Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                     ::To_double::operator()((To_double *)local_130,extraout_x1_00);
    dVar27 = SQRT(dVar26);
    if (dVar26 < 0.0) {
      sqrt(dVar26);
    }
    local_120 = ::operator_new(0x30);
    puVar19 = PTR_vtable_004de288;
    *(undefined4 *)(local_120 + 8) = 1;
    *(undefined **)local_120 = puVar19 + 0x10;
    *(long *)(local_120 + 0x20) = 0;
    *(double *)(local_120 + 0x10) = -dVar27;
    *(double *)(local_120 + 0x18) = dVar27;
    *(double *)(local_120 + 0x28) = dVar27;
                    /* try { // try from 0036fa7c to 0036fa7f has its CatchHandler @ 00370a44 */
    CGAL::
    Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_divided_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_divided_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
    ::operator()((Vector_2 *)&local_150,(Lazy_exact_nt *)&local_148);
    CGAL::Handle::operator=((Handle *)&local_180,(Handle *)&local_168);
    if ((local_168 != (long *)0x0) &&
       (iVar11 = (int)local_168[1] + -1, *(int *)(local_168 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_168 + 8))();
    }
    if ((local_120 != (Lazy_exact_nt *)0x0) &&
       (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1, iVar11 + -1 == 0))
    {
      (**(code **)(*(long *)local_120 + 8))();
    }
    if ((local_130[0] != (Direction_2 *)0x0) &&
       (iVar11 = *(int *)(local_130[0] + 8), *(int *)(local_130[0] + 8) = iVar11 + -1,
       iVar11 + -1 == 0)) {
      (**(code **)(*(long *)local_130[0] + 8))();
    }
    if ((local_148 != (long *)0x0) &&
       (iVar11 = (int)local_148[1] + -1, *(int *)(local_148 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_148 + 8))();
    }
                    /* try { // try from 0036fafc to 0036faff has its CatchHandler @ 00370990 */
    CGAL::Aff_transformationC2<CGAL::Epeck>::Aff_transformationC2
              ((Aff_transformationC2<CGAL::Epeck> *)&local_178,0,(Handle *)&local_180);
    lVar17 = tpidr_el0;
    lVar16 = (*(code *)PTR_004e2f80)(&PTR_004e2f80);
    if ((*(ulong *)(lVar17 + lVar16) & 1) == 0) {
                    /* try { // try from 003704e0 to 003704e3 has its CatchHandler @ 003706dc */
      plVar18 = ::operator_new(0x58);
      ppuVar22 = &PTR_EscapePrecFlag_004de000;
      lVar16 = (*(code *)PTR_004e2fe0)(&PTR_004e2fe0);
      ppuVar25 = &PTR_EscapePrecFlag_004de000;
      *(long **)(lVar17 + lVar16) = plVar18;
      auVar28 = (*(code *)PTR_004e2f80)(&PTR_004e2f80,lVar17 + lVar16);
      plVar18[10] = 0;
      *(undefined4 *)(plVar18 + 1) = 1;
      puVar23 = ppuVar22[0x18b];
      *(undefined8 *)(lVar17 + auVar28._0_8_) = 1;
      puVar19 = ppuVar25[0xd];
      *plVar18 = (long)(puVar23 + 0x10);
      __cxa_thread_atexit(puVar19,auVar28._8_8_,&__dso_handle);
    }
    lVar16 = (*(code *)PTR_004e2fe0)(&PTR_004e2fe0);
    local_170 = *(long **)(lVar17 + lVar16);
    *(int *)(local_170 + 1) = (int)local_170[1] + 1;
                    /* try { // try from 0036fb50 to 0036fc77 has its CatchHandler @ 00370b78 */
    auVar28 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,(Segment_2 *)&local_170);
    dVar26 = DAT_00460af0;
    pSVar21 = auVar28._8_8_;
    uVar1 = auVar28._0_4_ & 0xff;
    local_218 = 0;
    bVar9 = 0;
    if ((auVar28._0_8_ & 0xff) != 0) {
      do {
        local_218 = local_218 + 1;
        if (param_5 != 0) {
                    /* try { // try from 00370128 to 0037012b has its CatchHandler @ 00370b78 */
          CGAL::
          Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
          ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                        *)&local_120,(Segment_2 *)&local_170);
          CGAL::Handle::operator=((Handle *)&local_170,(Handle *)&local_158);
          pSVar21 = extraout_x1_06;
          if (local_158 != (long *)0x0) {
            uVar12 = (int)local_158[1] - 1;
            pSVar21 = (Segment_2 *)(ulong)uVar12;
            *(uint *)(local_158 + 1) = uVar12;
            if (uVar12 == 0) {
              (**(code **)(*local_158 + 8))();
              pSVar21 = extraout_x1_07;
            }
          }
        }
        lVar17 = *(long *)(param_6 + 8);
        if (*(long *)param_6 != lVar17) {
          local_120 = (Lazy_exact_nt *)0x0;
          local_118 = 0;
          local_110 = 0;
                    /* try { // try from 00370054 to 00370057 has its CatchHandler @ 00370b38 */
          CGAL::
          Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
          ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                        *)&local_170,pSVar21);
                    /* try { // try from 00370068 to 0037006b has its CatchHandler @ 00370b48 */
          cVar10 = calculateShortestPath
                             (param_2,(Point_2 *)(lVar17 + -8),(Point_2 *)local_130,
                              (vector *)&local_120);
          if ((local_130[0] != (Direction_2 *)0x0) &&
             (iVar11 = *(int *)(local_130[0] + 8), *(int *)(local_130[0] + 8) = iVar11 + -1,
             iVar11 + -1 == 0)) {
            (**(code **)(*(long *)local_130[0] + 8))(local_130[0]);
          }
          if (cVar10 == '\0') {
            std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
            ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *
                    )&local_120);
            bVar8 = false;
            goto LAB_0036fe58;
          }
          pLVar15 = local_120 + 8;
          if (pLVar15 != (Lazy_exact_nt *)(local_118 + -8)) {
            do {
              while (plVar18 = *(long **)(param_6 + 8), plVar18 == *(long **)(param_6 + 0x10)) {
                    /* try { // try from 003700f4 to 003700f7 has its CatchHandler @ 00370b38 */
                std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                _M_realloc_insert<CGAL::Point_2<CGAL::Epeck>const&>(param_6,plVar18,pLVar15);
                pLVar15 = pLVar15 + 8;
                if ((Lazy_exact_nt *)(local_118 + -8) == pLVar15) goto LAB_00370110;
              }
              lVar17 = *(long *)pLVar15;
              *plVar18 = lVar17;
              pLVar15 = pLVar15 + 8;
              *(int *)(lVar17 + 8) = *(int *)(lVar17 + 8) + 1;
              *(long **)(param_6 + 8) = plVar18 + 1;
            } while ((Lazy_exact_nt *)(local_118 + -8) != pLVar15);
          }
LAB_00370110:
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
          ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                  &local_120);
          pSVar21 = extraout_x1_05;
        }
        CGAL::
        Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
        ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                      *)&local_170,pSVar21);
        puVar4 = *(undefined8 **)(param_6 + 8);
        if (puVar4 == *(undefined8 **)(param_6 + 0x10)) {
                    /* try { // try from 003702a4 to 003702a7 has its CatchHandler @ 00370b04 */
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
          _M_realloc_insert<CGAL::Point_2<CGAL::Epeck>>(param_6,puVar4,(Vector_2 *)&local_120);
        }
        else {
          *puVar4 = local_120;
          *(int *)(local_120 + 8) = *(int *)(local_120 + 8) + 1;
          *(undefined8 **)(param_6 + 8) = puVar4 + 1;
        }
        if ((local_120 != (Lazy_exact_nt *)0x0) &&
           (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1,
           iVar11 + -1 == 0)) {
          (**(code **)(*(long *)local_120 + 8))();
        }
        local_48 = -(double)local_170[2];
        if (((((double)local_170[3] == local_48) &&
             (dStack_40 = -(double)local_170[4], (double)local_170[5] == dStack_40)) &&
            (local_38 = -(double)local_170[6], (double)local_170[7] == local_38)) &&
           (dStack_30 = -(double)local_170[8], (double)local_170[9] == dStack_30)) {
          local_28 = 1;
                    /* try { // try from 00370018 to 0037001b has its CatchHandler @ 00370b78 */
          bVar8 = CGAL::
                  Filtered_predicate<CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                  ::operator()((Filtered_predicate<CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>
                                *)((long)&local_120 + 4),(Segment_2 *)&local_48);
        }
        else {
          local_28 = 0;
          dStack_30 = dStack_70;
          local_38 = local_78;
          dStack_40 = dStack_80;
          local_48 = local_88;
          bVar8 = CGAL::
                  Filtered_predicate<CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                  ::operator()((Filtered_predicate<CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Is_degenerate_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                *)&local_120,(Segment_2 *)&local_170);
        }
        if (bVar8 == false) {
          CGAL::
          Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_target_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_target_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
          ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_target_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_target_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                        *)local_130,(Segment_2 *)&local_170);
          puVar4 = *(undefined8 **)(param_6 + 8);
          if (puVar4 == *(undefined8 **)(param_6 + 0x10)) {
                    /* try { // try from 00370380 to 00370383 has its CatchHandler @ 00370b34 */
            std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
            _M_realloc_insert<CGAL::Point_2<CGAL::Epeck>>(param_6,puVar4,(Vector_2 *)&local_120);
          }
          else {
            *puVar4 = local_120;
            *(int *)(local_120 + 8) = *(int *)(local_120 + 8) + 1;
            *(undefined8 **)(param_6 + 8) = puVar4 + 1;
          }
          if ((local_120 != (Lazy_exact_nt *)0x0) &&
             (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1,
             iVar11 + -1 == 0)) {
            (**(code **)(*(long *)local_120 + 8))();
          }
        }
        local_168 = local_1a8;
        uVar12 = (int)local_1a8[1] + 1;
        pEVar24 = (Epeck *)(ulong)uVar12;
        *(uint *)(local_1a8 + 1) = uVar12;
                    /* try { // try from 0036fce0 to 0036fce3 has its CatchHandler @ 003705a8 */
        CGAL::Line_2<CGAL::Epeck>::transform((Aff_transformation_2 *)&local_1a8);
        CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)&local_160);
        if ((local_160 != (long *)0x0) &&
           (iVar11 = (int)local_160[1] + -1, *(int *)(local_160 + 1) = iVar11, iVar11 == 0)) {
          (**(code **)(*local_160 + 8))();
        }
        if (param_5 == 0) {
          local_158 = local_170;
          *(int *)(local_170 + 1) = (int)local_170[1] + 1;
        }
        else {
                    /* try { // try from 0037016c to 0037016f has its CatchHandler @ 003705a8 */
          CGAL::
          Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
          ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_opposite_segment_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                        *)&local_120,(Segment_2 *)&local_170);
        }
                    /* try { // try from 0036fd38 to 0036fd3b has its CatchHandler @ 00370afc */
        uVar12 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,(Segment_2 *)&local_170)
        ;
        if ((uVar12 & 0xff) == 0) {
          if (*(long *)param_6 == *(long *)(param_6 + 8)) {
LAB_00370174:
            bVar2 = 3 < local_218 & (bVar9 ^ 1);
            if (bVar2 == 0) {
                    /* try { // try from 003702bc to 00370327 has its CatchHandler @ 00370afc */
              CGAL::Line_2<CGAL::Epeck>::Line_2((Point_2 *)local_130,local_f8 + -8);
              CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)local_130);
              if ((local_130[0] != (Direction_2 *)0x0) &&
                 (iVar11 = *(int *)(local_130[0] + 8), *(int *)(local_130[0] + 8) = iVar11 + -1,
                 iVar11 + -1 == 0)) {
                (**(code **)(*(long *)local_130[0] + 8))();
              }
              cVar10 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,
                                        (Segment_2 *)&local_170);
              if (cVar10 != '\0') goto LAB_003701e8;
LAB_00370308:
              std::__ostream_insert<char,std::char_traits<char>>
                        ((ostream *)PTR_cout_004de960,"Failed to calculate final sweep.",0x20);
              std::endl<char,std::char_traits<char>>((ostream *)PTR_cout_004de960);
LAB_00370328:
              if ((local_158 != (long *)0x0) &&
                 (iVar11 = (int)local_158[1] + -1, *(int *)(local_158 + 1) = iVar11, iVar11 == 0)) {
                (**(code **)(*local_158 + 8))();
              }
              if ((local_168 != (long *)0x0) &&
                 (iVar11 = (int)local_168[1] + -1, *(int *)(local_168 + 1) = iVar11, iVar11 == 0)) {
                (**(code **)(*local_168 + 8))();
              }
              bVar8 = false;
            }
            else {
                    /* try { // try from 00370198 to 003701fb has its CatchHandler @ 00370afc */
              CGAL::Line_2<CGAL::Epeck>::transform((Aff_transformation_2 *)&local_168);
              CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)&local_150);
              if ((local_150 != (long *)0x0) &&
                 (iVar11 = (int)local_150[1] + -1, *(int *)(local_150 + 1) = iVar11, iVar11 == 0)) {
                (**(code **)(*local_150 + 8))();
              }
              bVar9 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,
                                       (Segment_2 *)&local_170);
              if (bVar9 == 0) {
                    /* try { // try from 00370398 to 003703cf has its CatchHandler @ 00370afc */
                CGAL::Line_2<CGAL::Epeck>::Line_2((Point_2 *)&local_148,local_f8 + -8);
                CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)&local_148);
                if ((local_148 != (long *)0x0) &&
                   (iVar11 = (int)local_148[1] + -1, *(int *)(local_148 + 1) = iVar11, iVar11 == 0))
                {
                  (**(code **)(*local_148 + 8))();
                }
                cVar10 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,
                                          (Segment_2 *)&local_170);
                bVar9 = bVar2;
                if (cVar10 == '\0') goto LAB_00370308;
              }
LAB_003701e8:
              CGAL::internal::squared_distance<CGAL::Epeck>
                        ((internal *)&local_170,(Segment_2 *)&local_158,(Segment_2 *)local_130,
                         pEVar24);
                    /* try { // try from 00370204 to 00370207 has its CatchHandler @ 00370b80 */
              bVar8 = CGAL::operator<((Lazy_exact_nt *)&local_120,dVar26);
              if ((local_120 != (Lazy_exact_nt *)0x0) &&
                 (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1,
                 iVar11 + -1 == 0)) {
                (**(code **)(*(long *)local_120 + 8))(local_120);
              }
              if (!bVar8) goto LAB_0036fd44;
              if ((local_158 != (long *)0x0) &&
                 (iVar11 = (int)local_158[1] + -1, *(int *)(local_158 + 1) = iVar11, iVar11 == 0)) {
                (**(code **)(*local_158 + 8))();
              }
              if ((local_168 != (long *)0x0) &&
                 (iVar11 = (int)local_168[1] + -1, *(int *)(local_168 + 1) = iVar11, iVar11 == 0)) {
                (**(code **)(*local_168 + 8))();
              }
            }
            goto LAB_0036fe58;
          }
          bVar8 = CGAL::
                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::internal::Static_filters_predicates::Equal_2<CGAL::Filtered_kernel_base<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>>>>
                  ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::internal::Static_filters_predicates::Equal_2<CGAL::Filtered_kernel_base<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>>>>
                                *)&local_120,(Point_2 *)(*(long *)(param_6 + 8) + -8),
                               (Point_2 *)(local_f8 + -8));
          pSVar21 = extraout_x1_03;
          uVar12 = uVar12 & 0xff;
          if (!bVar8) {
            if (((ulong)(*(long *)(param_6 + 8) - *(long *)param_6) < 0x10) ||
               (bVar8 = CGAL::
                        Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::internal::Static_filters_predicates::Equal_2<CGAL::Filtered_kernel_base<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>>>>
                        ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Equal_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::internal::Static_filters_predicates::Equal_2<CGAL::Filtered_kernel_base<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>>>>
                                      *)&local_120,(Point_2 *)(*(long *)(param_6 + 8) + -0x10),
                                     (Point_2 *)(local_f8 + -8)), !bVar8)) goto LAB_00370174;
            pSVar21 = extraout_x1_04;
            uVar12 = 0;
          }
        }
        else {
LAB_0036fd44:
          *(int *)(pLVar14 + 8) = *(int *)(pLVar14 + 8) + 1;
          local_130[0] = local_f8;
          local_120 = pLVar14;
                    /* try { // try from 0036fd74 to 0036fd77 has its CatchHandler @ 00370998 */
          checkObservability((Handle *)&local_158,
                             (Lazy_construction<CGAL::Epeck,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CommonKernelFunctors::Construct_source_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                              *)&local_170,(Direction_2 *)&local_100,(Vector_2 *)&local_120,
                             (Line_2 *)local_130);
          if ((local_120 != (Lazy_exact_nt *)0x0) &&
             (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1,
             iVar11 + -1 == 0)) {
            (**(code **)(*(long *)local_120 + 8))();
          }
          pSVar21 = (Segment_2 *)local_130[0];
          uVar12 = uVar1;
          if (local_130[0] != local_f8) {
                    /* try { // try from 0036fdb4 to 0036ffeb has its CatchHandler @ 00370afc */
            CGAL::Line_2<CGAL::Epeck>::Line_2((Point_2 *)&local_120,local_130[0]);
            CGAL::Handle::operator=((Handle *)&local_1a8,(Handle *)&local_120);
            if ((local_120 != (Lazy_exact_nt *)0x0) &&
               (iVar11 = *(int *)(local_120 + 8), *(int *)(local_120 + 8) = iVar11 + -1,
               iVar11 + -1 == 0)) {
              (**(code **)(*(long *)local_120 + 8))();
            }
            auVar28 = findSweepSegment((Polygon_2 *)param_1,(Line_2 *)&local_1a8,
                                       (Segment_2 *)&local_170);
            pSVar21 = auVar28._8_8_;
            if ((auVar28._0_8_ & 0xff) == 0) {
                    /* try { // try from 00370570 to 00370587 has its CatchHandler @ 00370afc */
              std::__ostream_insert<char,std::char_traits<char>>
                        ((ostream *)PTR_cout_004de960,"Failed to calculate extra sweep at point: ",
                         0x2a);
              poVar20 = CGAL::insert<CGAL::Epeck>
                                  ((ostream *)PTR_cout_004de960,(Point_2 *)local_130[0],
                                   (Cartesian_tag *)&local_120);
              std::endl<char,std::char_traits<char>>(poVar20);
              goto LAB_00370328;
            }
          }
        }
        param_5 = param_5 ^ 1;
        if (local_158 != (long *)0x0) {
          uVar6 = (int)local_158[1] - 1;
          pSVar21 = (Segment_2 *)(ulong)uVar6;
          *(uint *)(local_158 + 1) = uVar6;
          if (uVar6 == 0) {
            (**(code **)(*local_158 + 8))();
            pSVar21 = extraout_x1_01;
          }
        }
        if (local_168 != (long *)0x0) {
          uVar6 = (int)local_168[1] - 1;
          pSVar21 = (Segment_2 *)(ulong)uVar6;
          *(uint *)(local_168 + 1) = uVar6;
          if (uVar6 == 0) {
            (**(code **)(*local_168 + 8))();
            pSVar21 = extraout_x1_02;
          }
        }
      } while (uVar12 != 0);
    }
    bVar8 = true;
LAB_0036fe58:
    if ((local_170 != (long *)0x0) &&
       (iVar11 = (int)local_170[1] + -1, *(int *)(local_170 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_170 + 8))();
    }
    iVar11 = (int)local_178[1] + -1;
    *(int *)(local_178 + 1) = iVar11;
    if (iVar11 == 0) {
      (**(code **)(*local_178 + 0x18))();
    }
    if ((local_180 != (long *)0x0) &&
       (iVar11 = (int)local_180[1] + -1, *(int *)(local_180 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_180 + 8))();
    }
    if ((local_140[0] != (long *)0x0) &&
       (iVar11 = (int)local_140[0][1] + -1, *(int *)(local_140[0] + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_140[0] + 8))();
    }
    iVar11 = (int)local_188[1] + -1;
    *(int *)(local_188 + 1) = iVar11;
    if (iVar11 == 0) {
      (**(code **)(*local_188 + 0x18))();
    }
    if ((local_198 != (long *)0x0) &&
       (iVar11 = (int)local_198[1] + -1, *(int *)(local_198 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_198 + 8))();
    }
    std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::~vector
              ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
               &local_100);
    if ((local_1a8 != (long *)0x0) &&
       (iVar11 = (int)local_1a8[1] + -1, *(int *)(local_1a8 + 1) = iVar11, iVar11 == 0)) {
      (**(code **)(*local_1a8 + 8))();
    }
  }
  iVar11 = *(int *)(pLVar14 + 8);
  *(int *)(pLVar14 + 8) = iVar11 + -1;
  if (iVar11 + -1 == 0) {
    (**(code **)(*(long *)pLVar14 + 8))(pLVar14);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return bVar8;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(PTR___stack_chk_guard_004de1a8,bVar8,
                   local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== std::__insertion_sort<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::{lambda(int,int)#1}>> @ 003f6558 =====

/* WARNING: Unknown calling convention -- yet parameter storage is locked */
/* void std::__insertion_sort<__gnu_cxx::__normal_iterator<int*, std::vector<int,
   std::allocator<int> > >,
   __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int, cv::Mat const&,
   cv::Mat const&, bool, unsigned char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*)::{lambda(int, int)#1}> >(__gnu_cxx::__normal_iterator<int*, std::vector<int,
   std::allocator<int> > >, __gnu_cxx::__normal_iterator<int*, std::vector<int, std::allocator<int>
   > >, __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int, cv::Mat
   const&, cv::Mat const&, bool, unsigned char, std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >*)::{lambda(int, int)#1}>) */

void std::
     __insertion_sort<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
               (int *param_1,int *param_2,long *param_3)

{
  int iVar1;
  int iVar2;
  int *piVar3;
  int *piVar4;
  int *piVar5;
  double dVar6;
  double dVar7;
  undefined4 local_38 [2];
  long local_30;
  undefined8 local_28;
  undefined4 local_20 [2];
  long local_18;
  undefined8 local_10;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  if ((param_1 != param_2) && (piVar5 = param_1 + 1, param_2 != piVar5)) {
    do {
      iVar1 = *param_1;
      local_20[0] = 0x8103000c;
      local_18 = *param_3 + (long)*piVar5 * 0x18;
      local_10 = 0;
      dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
      local_38[0] = 0x8103000c;
      local_28 = 0;
      local_30 = *param_3 + (long)iVar1 * 0x18;
      dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
      if (dVar6 <= dVar7) {
        iVar1 = *piVar5;
        piVar3 = piVar5;
        while( true ) {
          local_18 = *param_3 + (long)iVar1 * 0x18;
          piVar4 = piVar3 + -1;
          iVar2 = *piVar4;
          local_20[0] = 0x8103000c;
          local_10 = 0;
          dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
          local_38[0] = 0x8103000c;
          local_30 = *param_3 + (long)iVar2 * 0x18;
          local_28 = 0;
          dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
          if (dVar6 <= dVar7) break;
          *piVar3 = *piVar4;
          piVar3 = piVar4;
        }
        *piVar3 = iVar1;
      }
      else {
        iVar1 = *piVar5;
        if (param_1 != piVar5) {
          memmove(param_1 + 1,param_1,(long)piVar5 - (long)param_1);
        }
        *param_1 = iVar1;
      }
      piVar5 = piVar5 + 1;
    } while (param_2 != piVar5);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(PTR___stack_chk_guard_004de1a8,local_8 - *(long *)PTR___stack_chk_guard_004de1a8,
                   0);
}



// ===== std::__adjust_heap<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,int,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::{lambda(int,int)#1}>> @ 003f6720 =====

/* WARNING: Unknown calling convention -- yet parameter storage is locked */
/* void std::__adjust_heap<__gnu_cxx::__normal_iterator<int*, std::vector<int, std::allocator<int> >
   >, long, int, __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int,
   cv::Mat const&, cv::Mat const&, bool, unsigned char, std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >*)::{lambda(int, int)#1}>
   >(__gnu_cxx::__normal_iterator<int*, std::vector<int, std::allocator<int> > >, long, long, int,
   __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int, cv::Mat const&,
   cv::Mat const&, bool, unsigned char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*)::{lambda(int, int)#1}>) */

void std::
     __adjust_heap<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,int,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
               (long param_1,long param_2,ulong param_3,int param_4,long *param_5)

{
  long lVar1;
  long lVar2;
  int iVar3;
  undefined *puVar4;
  long lVar5;
  int *piVar6;
  long lVar7;
  long lVar8;
  long lVar9;
  double dVar10;
  double dVar11;
  undefined4 local_38 [2];
  long local_30;
  undefined8 local_28;
  undefined4 local_20 [2];
  long local_18;
  undefined8 local_10;
  long local_8;
  
  lVar2 = (long)(param_3 - 1) / 2;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  if (param_2 < lVar2) {
    lVar8 = param_2;
    do {
      while( true ) {
        lVar5 = (lVar8 + 1) * 8;
        lVar9 = (lVar8 + 1) * 2;
        lVar7 = lVar9 + -1;
        lVar1 = lVar7 * 4;
        iVar3 = *(int *)(param_1 + lVar7 * 4);
        local_18 = *param_5 + (long)*(int *)(param_1 + lVar5) * 0x18;
        local_20[0] = 0x8103000c;
        local_10 = 0;
        dVar10 = (double)cv::contourArea((_InputArray *)local_20,false);
        local_38[0] = 0x8103000c;
        local_28 = 0;
        local_30 = *param_5 + (long)iVar3 * 0x18;
        dVar11 = (double)cv::contourArea((_InputArray *)local_38,false);
        if (dVar11 < dVar10) break;
        *(undefined4 *)(param_1 + lVar8 * 4) = *(undefined4 *)(param_1 + lVar5);
        lVar8 = lVar9;
        lVar7 = lVar9;
        lVar1 = lVar5;
        if (lVar2 <= lVar9) goto LAB_003f6870;
      }
      *(undefined4 *)(param_1 + lVar8 * 4) = *(undefined4 *)(param_1 + lVar7 * 4);
      lVar8 = lVar7;
    } while (lVar7 < lVar2);
LAB_003f6870:
    piVar6 = (int *)(param_1 + lVar1);
    if ((param_3 & 1) == 0) goto LAB_003f6988;
  }
  else {
    piVar6 = (int *)(param_1 + param_2 * 4);
    lVar7 = param_2;
    if ((param_3 & 1) != 0) goto LAB_003f6938;
LAB_003f6988:
    if (lVar7 == (long)(param_3 - 2) / 2) {
      lVar7 = lVar7 * 2 + 1;
      *piVar6 = *(int *)(param_1 + lVar7 * 4);
      piVar6 = (int *)(param_1 + lVar7 * 4);
    }
  }
  lVar2 = (lVar7 + -1) - (lVar7 + -1 >> 0x3f);
  if (param_2 < lVar7) {
    do {
      lVar8 = lVar2 >> 1;
      local_20[0] = 0x8103000c;
      local_18 = *param_5 + (long)*(int *)(param_1 + lVar8 * 4) * 0x18;
      local_10 = 0;
      dVar10 = (double)cv::contourArea((_InputArray *)local_20,false);
      local_38[0] = 0x8103000c;
      local_30 = *param_5 + (long)param_4 * 0x18;
      local_28 = 0;
      dVar11 = (double)cv::contourArea((_InputArray *)local_38,false);
      piVar6 = (int *)(param_1 + lVar7 * 4);
      if (dVar10 <= dVar11) break;
      *(undefined4 *)(param_1 + lVar7 * 4) = *(undefined4 *)(param_1 + lVar8 * 4);
      lVar2 = (lVar8 + -1) - (lVar8 + -1 >> 0x3f);
      piVar6 = (int *)(param_1 + lVar8 * 4);
      lVar7 = lVar8;
    } while (param_2 < lVar8);
  }
LAB_003f6938:
  puVar4 = PTR___stack_chk_guard_004de1a8;
  *piVar6 = param_4;
  if (local_8 - *(long *)puVar4 == 0) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)puVar4,0);
}



// ===== std::__introsort_loop<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::{lambda(int,int)#1}>> @ 003f77d8 =====

/* WARNING: Unknown calling convention -- yet parameter storage is locked */
/* void std::__introsort_loop<__gnu_cxx::__normal_iterator<int*, std::vector<int,
   std::allocator<int> > >, long,
   __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int, cv::Mat const&,
   cv::Mat const&, bool, unsigned char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*)::{lambda(int, int)#1}> >(__gnu_cxx::__normal_iterator<int*, std::vector<int,
   std::allocator<int> > >, __gnu_cxx::__normal_iterator<int*, std::vector<int, std::allocator<int>
   > >, long, __gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int, int,
   cv::Mat const&, cv::Mat const&, bool, unsigned char, std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >*)::{lambda(int, int)#1}>) */

void std::
     __introsort_loop<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
               (int *param_1,int *param_2,long param_3,long *param_4)

{
  int iVar1;
  long lVar2;
  int iVar3;
  int *piVar4;
  long lVar5;
  double dVar6;
  double dVar7;
  int *local_50;
  undefined4 local_38 [2];
  long local_30;
  undefined8 local_28;
  undefined4 local_20 [2];
  long local_18;
  undefined8 local_10;
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  lVar2 = (long)param_2 - (long)param_1;
  if (0x40 < lVar2) {
    local_50 = param_2;
    if (param_3 != 0) {
LAB_003f784c:
      param_3 = param_3 + -1;
      local_18 = *param_4 + (long)param_1[1] * 0x18;
      lVar2 = ((long)param_2 - (long)param_1 >> 2) - ((long)param_2 - (long)param_1 >> 0x3f) >> 1;
      iVar3 = param_1[lVar2];
      local_20[0] = 0x8103000c;
      local_10 = 0;
      dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
      local_38[0] = 0x8103000c;
      local_30 = *param_4 + (long)iVar3 * 0x18;
      local_28 = 0;
      dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
      piVar4 = param_2;
      local_50 = param_1;
      if (dVar6 <= dVar7) {
        iVar3 = param_2[-1];
        local_20[0] = 0x8103000c;
        local_18 = *param_4 + (long)param_1[1] * 0x18;
        local_10 = 0;
        dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
        local_38[0] = 0x8103000c;
        local_28 = 0;
        local_30 = *param_4 + (long)iVar3 * 0x18;
        dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
        if (dVar7 < dVar6) goto LAB_003f7a98;
        iVar3 = param_2[-1];
        local_20[0] = 0x8103000c;
        local_18 = *param_4 + (long)param_1[lVar2] * 0x18;
        local_10 = 0;
        dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
        local_38[0] = 0x8103000c;
        local_28 = 0;
        local_30 = *param_4 + (long)iVar3 * 0x18;
        dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
        if (dVar7 < dVar6) {
          iVar3 = *param_1;
          *param_1 = param_2[-1];
          param_2[-1] = iVar3;
          iVar3 = *param_1;
          goto LAB_003f7928;
        }
      }
      else {
        iVar3 = param_2[-1];
        local_20[0] = 0x8103000c;
        local_18 = *param_4 + (long)param_1[lVar2] * 0x18;
        local_10 = 0;
        dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
        local_38[0] = 0x8103000c;
        local_28 = 0;
        local_30 = *param_4 + (long)iVar3 * 0x18;
        dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
        if (dVar6 <= dVar7) {
          iVar3 = param_2[-1];
          local_20[0] = 0x8103000c;
          local_18 = *param_4 + (long)param_1[1] * 0x18;
          local_10 = 0;
          dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
          local_38[0] = 0x8103000c;
          local_28 = 0;
          local_30 = *param_4 + (long)iVar3 * 0x18;
          dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
          if (dVar7 < dVar6) {
            iVar3 = *param_1;
            *param_1 = param_2[-1];
            param_2[-1] = iVar3;
            iVar3 = *param_1;
            goto LAB_003f7928;
          }
LAB_003f7a98:
          iVar1 = *param_1;
          iVar3 = param_1[1];
          *param_1 = iVar3;
          param_1[1] = iVar1;
          goto LAB_003f7928;
        }
      }
      iVar3 = *param_1;
      *param_1 = param_1[lVar2];
      param_1[lVar2] = iVar3;
      iVar3 = *param_1;
LAB_003f7928:
      do {
        local_50 = local_50 + 1;
        local_18 = *param_4 + (long)*local_50 * 0x18;
        local_20[0] = 0x8103000c;
        local_10 = 0;
        dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
        local_38[0] = 0x8103000c;
        local_28 = 0;
        local_30 = *param_4 + (long)iVar3 * 0x18;
        dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
        if (dVar6 <= dVar7) {
          do {
            piVar4 = piVar4 + -1;
            iVar3 = *piVar4;
            local_18 = *param_4 + (long)*param_1 * 0x18;
            local_20[0] = 0x8103000c;
            local_10 = 0;
            dVar6 = (double)cv::contourArea((_InputArray *)local_20,false);
            local_38[0] = 0x8103000c;
            local_28 = 0;
            local_30 = *param_4 + (long)iVar3 * 0x18;
            dVar7 = (double)cv::contourArea((_InputArray *)local_38,false);
          } while (dVar7 < dVar6);
          if (piVar4 <= local_50) goto LAB_003f7a18;
          iVar3 = *local_50;
          *local_50 = *piVar4;
          *piVar4 = iVar3;
        }
        iVar3 = *param_1;
      } while( true );
    }
LAB_003f7aac:
    for (lVar5 = (lVar2 >> 2) + -2 >> 1;
        __adjust_heap<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,int,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
                  (param_1,lVar5,lVar2 >> 2,param_1[lVar5],param_4), lVar5 != 0; lVar5 = lVar5 + -1)
    {
    }
    do {
      local_50 = local_50 + -1;
      iVar3 = *local_50;
      *local_50 = *param_1;
      __adjust_heap<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,int,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
                (param_1,0,(long)local_50 - (long)param_1 >> 2,iVar3,param_4);
    } while (4 < (long)local_50 - (long)param_1);
  }
LAB_003f7b20:
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
LAB_003f7a18:
  __introsort_loop<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
            (local_50,param_2,param_3,param_4);
  lVar2 = (long)local_50 - (long)param_1;
  if (lVar2 < 0x41) goto LAB_003f7b20;
  param_2 = local_50;
  if (param_3 == 0) goto LAB_003f7aac;
  goto LAB_003f784c;
}



// ===== coverage_plan::BsdTspPlanner::makePlan @ 003f7de0 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::BsdTspPlanner::makePlan(int, int, unsigned char const*, int, int, bool, unsigned
   char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

undefined4 __thiscall
coverage_plan::BsdTspPlanner::makePlan
          (BsdTspPlanner *this,int param_1,int param_2,uchar *param_3,int param_4,int param_5,
          bool param_6,uchar param_7,map *param_8)

{
  int *piVar1;
  int iVar2;
  char cVar3;
  bool bVar4;
  undefined4 uVar5;
  long lVar6;
  long lVar7;
  int local_78;
  int iStack_74;
  undefined8 local_70;
  undefined8 uStack_68;
  long local_60;
  undefined8 uStack_58;
  undefined8 local_50;
  undefined8 uStack_48;
  undefined8 uStack_40;
  long local_38;
  undefined8 *local_30;
  long *local_28;
  long local_20 [3];
  long local_8;
  
  local_30 = &uStack_68;
  local_28 = local_20;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  uStack_68 = _UNK_00454ad8;
  local_70 = _DAT_00454ad0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  local_38 = 0;
  uStack_40 = 0;
  local_20[1] = 0;
  local_20[0] = 0;
  local_78 = param_5;
  iStack_74 = param_4;
  cv::Mat::create((int)&local_70,(int *)0x2,(int)&local_78);
  if ((0 < param_5) && (0 < param_4)) {
    lVar7 = 0;
    do {
      lVar6 = 0;
      do {
        *(uchar *)(local_60 + lVar7 * *local_28 + lVar6) = param_3[lVar6];
        lVar6 = lVar6 + 1;
      } while ((int)lVar6 < param_4);
      lVar7 = lVar7 + 1;
      param_3 = param_3 + param_4;
    } while ((int)lVar7 < param_5);
  }
                    /* try { // try from 003f7ef4 to 003f7ef7 has its CatchHandler @ 003f7fb0 */
  uVar5 = (**(code **)(*(long *)this + 0x30))
                    (this,param_1,param_2,&local_70,param_6,param_7,param_8);
  if (local_38 != 0) {
    piVar1 = (int *)(local_38 + 0x14);
    do {
      iVar2 = *piVar1;
      cVar3 = '\x01';
      bVar4 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar4) {
        *piVar1 = iVar2 + -1;
        cVar3 = ExclusiveMonitorsStatus();
      }
    } while (cVar3 != '\0');
    if (iVar2 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_38 = 0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  if (0 < local_70._4_4_) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_30 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_70._4_4_);
  }
  if (local_28 != local_20) {
    cv::fastFree(local_28);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return uVar5;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::BsdTspPlanner::makePlan @ 003f7fc8 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::BsdTspPlanner::makePlan(int, int, unsigned char const*, unsigned char const*, int,
   int, bool, unsigned char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

undefined4 __thiscall
coverage_plan::BsdTspPlanner::makePlan
          (BsdTspPlanner *this,int param_1,int param_2,uchar *param_3,uchar *param_4,int param_5,
          int param_6,bool param_7,uchar param_8,map *param_9)

{
  int *piVar1;
  int iVar2;
  char cVar3;
  bool bVar4;
  undefined4 uVar5;
  long lVar6;
  long lVar7;
  int local_d8;
  int iStack_d4;
  undefined8 local_d0;
  undefined8 uStack_c8;
  long local_c0;
  undefined8 uStack_b8;
  undefined8 local_b0;
  undefined8 uStack_a8;
  undefined8 uStack_a0;
  long local_98;
  undefined8 *local_90;
  long *local_88;
  long local_80 [2];
  undefined8 local_70;
  int iStack_6c;
  undefined8 uStack_68;
  long local_60;
  undefined8 uStack_58;
  undefined8 local_50;
  undefined8 uStack_48;
  undefined8 uStack_40;
  long local_38;
  undefined8 *local_30;
  long *plStack_28;
  long alStack_20 [3];
  long local_8;
  
  local_90 = &uStack_c8;
  local_88 = local_80;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  uStack_c8 = _UNK_00454ad8;
  local_d0 = _DAT_00454ad0;
  uStack_b8 = 0;
  local_c0 = 0;
  uStack_a8 = 0;
  local_b0 = 0;
  local_98 = 0;
  uStack_a0 = 0;
  local_80[1] = 0;
  local_80[0] = 0;
  local_d8 = param_6;
  iStack_d4 = param_5;
  cv::Mat::create((int)&local_d0,(int *)0x2,(int)&local_d8);
  uStack_68 = _UNK_00454ad8;
  local_70 = _DAT_00454ad0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  local_38 = 0;
  uStack_40 = 0;
  alStack_20[1] = 0;
  alStack_20[0] = 0;
  local_d8 = param_6;
  iStack_d4 = param_5;
  local_30 = &uStack_68;
  plStack_28 = alStack_20;
                    /* try { // try from 003f80b4 to 003f80b7 has its CatchHandler @ 003f82b0 */
  cv::Mat::create((int)&stack0xffffffffffffff90,(int *)0x2,(int)&local_d8);
  if ((0 < param_6) && (0 < param_5)) {
    lVar7 = 0;
    do {
      lVar6 = 0;
      do {
        *(uchar *)(local_c0 + lVar7 * *local_88 + lVar6) = param_3[lVar6];
        *(uchar *)(local_60 + lVar7 * *plStack_28 + lVar6) = param_4[lVar6];
        lVar6 = lVar6 + 1;
      } while ((int)lVar6 < param_5);
      lVar7 = lVar7 + 1;
      param_3 = param_3 + param_5;
      param_4 = param_4 + param_5;
    } while ((int)lVar7 < param_6);
  }
                    /* try { // try from 003f8158 to 003f815b has its CatchHandler @ 003f8294 */
  uVar5 = (**(code **)(*(long *)this + 0x38))
                    (this,param_1,param_2,&local_d0,&stack0xffffffffffffff90,param_7,param_8,param_9
                    );
  if (local_38 != 0) {
    piVar1 = (int *)(local_38 + 0x14);
    do {
      iVar2 = *piVar1;
      cVar3 = '\x01';
      bVar4 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar4) {
        *piVar1 = iVar2 + -1;
        cVar3 = ExclusiveMonitorsStatus();
      }
    } while (cVar3 != '\0');
    if (iVar2 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_38 = 0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  if (0 < iStack_6c) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_30 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < iStack_6c);
  }
  if (plStack_28 != alStack_20) {
    cv::fastFree(plStack_28);
  }
  if (local_98 != 0) {
    piVar1 = (int *)(local_98 + 0x14);
    do {
      iVar2 = *piVar1;
      cVar3 = '\x01';
      bVar4 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar4) {
        *piVar1 = iVar2 + -1;
        cVar3 = ExclusiveMonitorsStatus();
      }
    } while (cVar3 != '\0');
    if (iVar2 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_98 = 0;
  uStack_b8 = 0;
  local_c0 = 0;
  uStack_a8 = 0;
  local_b0 = 0;
  if (0 < local_d0._4_4_) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_90 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_d0._4_4_);
  }
  if (local_88 != local_80) {
    cv::fastFree(local_88);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return uVar5;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::BsdTspPlanner::calculateRotations @ 003f8610 =====

/* coverage_plan::BsdTspPlanner::calculateRotations(std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >&) */

int coverage_plan::BsdTspPlanner::calculateRotations(map *param_1)

{
  _Rb_tree_node_base *p_Var1;
  int iVar2;
  
  iVar2 = 0;
  for (p_Var1 = *(_Rb_tree_node_base **)(param_1 + 0x18);
      p_Var1 != (_Rb_tree_node_base *)(param_1 + 8);
      p_Var1 = (_Rb_tree_node_base *)std::_Rb_tree_increment(p_Var1)) {
    iVar2 = iVar2 + (int)(*(long *)(p_Var1 + 0x30) - *(long *)(p_Var1 + 0x28) >> 3);
  }
  return iVar2;
}



// ===== coverage_plan::BsdTspPlanner::calculatePathLength @ 003f8660 =====

/* coverage_plan::BsdTspPlanner::calculatePathLength(std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >&) */

int * coverage_plan::BsdTspPlanner::calculatePathLength(map *param_1)

{
  int iVar1;
  long lVar2;
  undefined *puVar3;
  undefined8 uVar4;
  ulong uVar5;
  long lVar6;
  undefined8 *puVar7;
  long lVar8;
  undefined **ppuVar9;
  ulong uVar10;
  map *pmVar11;
  int *piVar12;
  double dVar13;
  undefined8 extraout_d0;
  undefined8 extraout_var;
  double dVar14;
  undefined1 auVar15 [16];
  
  dVar14 = 0.0;
  pmVar11 = *(map **)(param_1 + 0x18);
  do {
    if (pmVar11 == param_1 + 8) break;
    lVar8 = *(long *)(pmVar11 + 0x28);
    uVar5 = *(long *)(pmVar11 + 0x30) - lVar8 >> 3;
    if (uVar5 != 1) {
      uVar10 = 0;
      do {
        if (uVar5 <= uVar10) {
LAB_003f8730:
          auVar15 = std::__throw_out_of_range_fmt
                              ("vector::_M_range_check: __n (which is %zu) >= this->size() (which is %zu)"
                               ,uVar10);
          piVar12 = (int *)*auVar15._0_8_;
          iVar1 = *piVar12;
          *piVar12 = iVar1 + -1;
          if (iVar1 + -1 == 0) {
            lVar8 = tpidr_el0;
            CORE::RCRepImpl<CORE::BigIntRep>::decRef(*(RCRepImpl<CORE::BigIntRep> **)(piVar12 + 2));
            lVar6 = (*(code *)PTR_004e2fc0)(&PTR_004e2fc0);
            puVar7 = (undefined8 *)(lVar8 + lVar6);
            if ((*(ulong *)(lVar8 + lVar6) & 1) == 0) {
              ppuVar9 = &PTR_EscapePrecFlag_004de000;
              lVar2 = (*(code *)PTR_004e3040)(0,&PTR_004e3040);
              lVar6 = lVar8 + lVar2;
              *puVar7 = 1;
              ((undefined8 *)(lVar8 + lVar2))[1] = extraout_var;
              *(undefined8 *)(lVar8 + lVar2) = extraout_d0;
              puVar3 = ppuVar9[0xd2];
              *(undefined8 *)(lVar6 + 0x18) = extraout_var;
              *(undefined8 *)(lVar6 + 0x10) = extraout_d0;
              __cxa_thread_atexit(puVar3,lVar6,&__dso_handle);
            }
            lVar6 = (*(code *)PTR_004e3040)(&PTR_004e3040);
            puVar3 = PTR_cerr_004def38;
            if (*(long *)(lVar8 + lVar6 + 8) == *(long *)(lVar8 + lVar6 + 0x10)) {
              std::__ostream_insert<char,std::char_traits<char>>
                        ((ostream *)PTR_cerr_004def38,PTR_typeinfo_name_004de410,0x14);
              std::endl<char,std::char_traits<char>>((ostream *)puVar3);
            }
            lVar6 = (*(code *)PTR_004e3040)(&PTR_004e3040);
            uVar4 = *(undefined8 *)(lVar8 + lVar6);
            *(int **)(lVar8 + lVar6) = piVar12;
            *(undefined8 *)(piVar12 + 8) = uVar4;
          }
          piVar12 = (int *)*auVar15._8_8_;
          iVar1 = *piVar12;
          *auVar15._0_8_ = piVar12;
          *piVar12 = iVar1 + 1;
          return piVar12;
        }
        lVar6 = uVar10 * 8;
        uVar10 = uVar10 + 1;
        if (uVar5 <= uVar10) goto LAB_003f8730;
        dVar13 = hypot((double)(*(int *)(lVar8 + lVar6) - *(int *)(lVar8 + lVar6 + 8)),
                       (double)(*(int *)(lVar8 + lVar6 + 4) - *(int *)(lVar8 + lVar6 + 8 + 4)));
        dVar14 = dVar14 + dVar13;
        lVar8 = *(long *)(pmVar11 + 0x28);
        uVar5 = *(long *)(pmVar11 + 0x30) - lVar8 >> 3;
      } while (uVar10 < uVar5 - 1);
    }
    pmVar11 = (map *)std::_Rb_tree_increment((_Rb_tree_node_base *)pmVar11);
  } while (param_1 + 8 != pmVar11);
  return (int *)(ulong)(uint)(int)dVar14;
}



// ===== coverage_plan::BsdTspPlanner::makePlan @ 003f8868 =====

/* coverage_plan::BsdTspPlanner::makePlan(int, int, std::__cxx11::string, bool, unsigned char,
   std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

undefined1 __thiscall
coverage_plan::BsdTspPlanner::makePlan
          (BsdTspPlanner *this,undefined4 param_1,allocator *param_3,string *param_4,
          undefined1 param_5,undefined1 param_6,undefined8 param_7)

{
  int *piVar1;
  bool bVar2;
  undefined1 uVar3;
  char cVar4;
  int iVar5;
  undefined8 uVar6;
  size_t __n;
  long lVar7;
  ulong uVar8;
  undefined8 *local_880;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_878;
  undefined1 auStack_870 [4];
  int local_86c;
  int local_868;
  int local_864;
  undefined8 local_860;
  undefined8 uStack_858;
  undefined8 uStack_850;
  undefined8 uStack_848;
  long local_838;
  long local_830;
  undefined1 *local_828;
  undefined1 auStack_820 [24];
  undefined1 auStack_808 [1024];
  undefined1 *local_408 [2];
  undefined1 auStack_3f8 [1008];
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  uVar8 = (ulong)param_3 & 0xffffffff;
  cv::imread(param_4,0);
  if ((local_868 < 1) || (local_864 < 1)) {
                    /* try { // try from 003f8a8c to 003f8b0f has its CatchHandler @ 003f8b50 */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (iVar5 = rcutils_logging_initialize(), iVar5 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:31] error initializing logging: "
             ,1,100,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_808);
      rcutils_get_error_string(local_408);
      __n = strlen((char *)local_408);
      fwrite(auStack_808,1,__n,*(FILE **)PTR_stderr_004deec0);
      param_3 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
                    /* try { // try from 003f89c8 to 003f89cb has its CatchHandler @ 003f8b50 */
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",param_3);
                    /* try { // try from 003f89d8 to 003f89db has its CatchHandler @ 003f8b58 */
    rclcpp::get_logger((string *)local_408);
    uVar6 = 0;
    if (local_880 != (undefined8 *)0x0) {
      uVar6 = *local_880;
    }
                    /* try { // try from 003f89ec to 003f89ef has its CatchHandler @ 003f8b60 */
    cVar4 = rcutils_logging_logger_is_enabled_for(uVar6,0x1e);
    if (local_878 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_878);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
    uVar3 = 0;
    if (cVar4 != '\0') {
                    /* try { // try from 003f8a24 to 003f8a27 has its CatchHandler @ 003f8b50 */
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",param_3);
                    /* try { // try from 003f8a30 to 003f8a33 has its CatchHandler @ 003f8b64 */
      rclcpp::get_logger((string *)local_408);
      uVar6 = 0;
      if (local_880 != (undefined8 *)0x0) {
        uVar6 = *local_880;
      }
                    /* try { // try from 003f8a54 to 003f8a57 has its CatchHandler @ 003f8b18 */
      rcutils_log(&makePlan(int,int,std::__cxx11::string,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                   ::__rcutils_logging_location,0x1e,uVar6,"Illegal pictures or file not exists!!!")
      ;
      if (local_878 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_878);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
      uVar3 = 0;
    }
  }
  else {
                    /* try { // try from 003f88fc to 003f88ff has its CatchHandler @ 003f8b50 */
    uVar3 = (**(code **)(*(long *)this + 0x30))
                      (this,param_1,uVar8,auStack_870,param_5,param_6,param_7);
  }
  if (local_838 != 0) {
    piVar1 = (int *)(local_838 + 0x14);
    do {
      iVar5 = *piVar1;
      cVar4 = '\x01';
      bVar2 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar2) {
        *piVar1 = iVar5 + -1;
        cVar4 = ExclusiveMonitorsStatus();
      }
    } while (cVar4 != '\0');
    if (iVar5 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_838 = 0;
  uStack_858 = 0;
  local_860 = 0;
  uStack_848 = 0;
  uStack_850 = 0;
  if (0 < local_86c) {
    lVar7 = 0;
    do {
      *(undefined4 *)(local_830 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_86c);
  }
  if (local_828 != auStack_820) {
    cv::fastFree(local_828);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return uVar3;
}



// ===== coverage_plan::BsdTspPlanner::pathAssessFunction @ 003f8b70 =====

/* coverage_plan::BsdTspPlanner::pathAssessFunction(std::map<int,
   std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> >,
   std::less<int>, std::allocator<std::pair<int const, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> > > > >&, double, double, double) */

void __thiscall
coverage_plan::BsdTspPlanner::pathAssessFunction
          (BsdTspPlanner *this,map *param_1,double param_2,double param_3,double param_4)

{
  undefined *puVar1;
  char cVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  undefined8 uVar6;
  size_t __n;
  allocator *paVar7;
  double dVar8;
  undefined8 *local_818;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_810;
  undefined1 auStack_808 [1024];
  undefined1 *local_408 [2];
  undefined1 auStack_3f8 [1008];
  long local_8;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  paVar7 = (allocator *)PTR___stack_chk_guard_004de1a8;
  iVar3 = calculateRotations(param_1);
  iVar4 = calculatePathLength(param_1);
  dVar8 = ((double)iVar4 * param_2) / param_3 + ((double)iVar3 * DAT_0046c8d0) / param_4;
  if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
    iVar5 = rcutils_logging_initialize();
    puVar1 = PTR_stderr_004deec0;
    if (iVar5 != 0) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:840] error initializing logging: "
             ,1,0x65,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_808);
      rcutils_get_error_string(local_408);
      __n = strlen((char *)local_408);
      fwrite(auStack_808,1,__n,*(FILE **)puVar1);
      paVar7 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)puVar1);
      rcutils_reset_error();
    }
  }
  std::__cxx11::string::string<std::allocator<char>>
            ((string *)local_408,"coverage_planner_server",paVar7);
                    /* try { // try from 003f8c24 to 003f8c27 has its CatchHandler @ 003f8dd8 */
  rclcpp::get_logger((string *)local_408);
  uVar6 = 0;
  if (local_818 != (undefined8 *)0x0) {
    uVar6 = *local_818;
  }
                    /* try { // try from 003f8c38 to 003f8c3b has its CatchHandler @ 003f8da4 */
  cVar2 = rcutils_logging_logger_is_enabled_for(uVar6,0x14);
  if (local_810 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_810);
  }
  if (local_408[0] != auStack_3f8) {
    ::operator_delete(local_408[0]);
  }
  if (cVar2 != '\0') {
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar7);
                    /* try { // try from 003f8cc8 to 003f8ccb has its CatchHandler @ 003f8de0 */
    rclcpp::get_logger((string *)local_408);
    uVar6 = 0;
    if (local_818 != (undefined8 *)0x0) {
      uVar6 = *local_818;
    }
                    /* try { // try from 003f8cfc to 003f8cff has its CatchHandler @ 003f8dd4 */
    rcutils_log(dVar8,pathAssessFunction(std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>&,double,double,double)
                      ::__rcutils_logging_location,0x14,uVar6,
                "path_length:%d, rotations:%d, time_estimate:%lf",iVar4,iVar3);
    if (local_810 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_810);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(CONCAT44(iVar3,iVar4),dVar8,local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0
                    );
  }
  return;
}



// ===== coverage_plan::removeSelfIntersection @ 003f8f90 =====

/* coverage_plan::removeSelfIntersection(std::vector<cv::Point_<int>, std::allocator<cv::Point_<int>
   > >&, int&) */

void coverage_plan::removeSelfIntersection(vector *param_1,int *param_2)

{
  double dVar1;
  undefined8 *puVar2;
  char cVar3;
  int iVar4;
  undefined8 uVar5;
  undefined8 *puVar6;
  void *pvVar7;
  size_t __n;
  undefined8 *puVar8;
  long lVar10;
  long lVar11;
  ulong uVar12;
  long lVar13;
  ulong uVar14;
  undefined8 *puVar15;
  allocator *paVar16;
  allocator *paVar17;
  ulong uVar18;
  uint uVar19;
  uint uVar20;
  ulong uVar21;
  float fVar22;
  double dVar23;
  double dVar24;
  uint local_850;
  undefined4 uStack_84c;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_848;
  allocator *local_840;
  allocator *local_838;
  allocator *local_830;
  undefined8 local_820;
  undefined8 *local_818;
  undefined8 *local_810;
  undefined1 auStack_808 [1024];
  undefined1 *local_408 [2];
  undefined1 auStack_3f8 [1008];
  long local_8;
  undefined8 *puVar9;
  
  dVar1 = DAT_0046c8d8;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  lVar10 = *(long *)param_1;
  if ((ulong)(*(long *)(param_1 + 8) - lVar10) < 0x30) goto LAB_003f9334;
  paVar16 = (allocator *)0x1;
  *param_2 = *param_2 + 1;
  local_850 = 1;
  local_840 = (allocator *)0x0;
  local_838 = (allocator *)0x0;
  local_830 = (allocator *)0x0;
LAB_003f9020:
  do {
    lVar11 = (ulong)((int)paVar16 - 1) * 8;
    dVar23 = atan2((double)(*(int *)(lVar10 + (long)paVar16 * 8) - *(int *)(lVar10 + lVar11)),
                   (double)(*(int *)(lVar10 + (long)paVar16 * 8 + 4) - *(int *)(lVar10 + lVar11 + 4)
                           ));
    lVar11 = *(long *)param_1;
    lVar10 = (ulong)(local_850 + 1) * 8;
    uVar19 = *(uint *)(lVar11 + lVar10 + 4);
    paVar16 = (allocator *)(ulong)uVar19;
    dVar24 = atan2((double)(*(int *)(lVar11 + (ulong)local_850 * 8) - *(int *)(lVar11 + lVar10)),
                   (double)(int)(*(int *)(lVar11 + (ulong)local_850 * 8 + 4) - uVar19));
    if (ABS(dVar23 - dVar24) < 0.35) {
      if (local_838 != local_830) {
        paVar17 = local_838 + 4;
        *(uint *)local_838 = local_850;
        local_838 = paVar17;
        if (local_840 != paVar17) goto LAB_003f9144;
        goto LAB_003f942c;
      }
      paVar16 = (allocator *)&local_850;
                    /* try { // try from 003f95d8 to 003f95db has its CatchHandler @ 003f9710 */
      std::vector<unsigned_int,std::allocator<unsigned_int>>::_M_realloc_insert<unsigned_int_const&>
                ((vector<unsigned_int,std::allocator<unsigned_int>> *)&local_840,local_838);
      break;
    }
    uVar12 = (ulong)local_850;
    uVar19 = local_850 + 2;
    do {
      uVar20 = uVar19;
      lVar10 = *(long *)param_1;
      lVar11 = *(long *)(param_1 + 8) - lVar10 >> 3;
      if (lVar11 - 4U <= (ulong)uVar20) {
        local_850 = (int)uVar12 + 1;
        paVar16 = (allocator *)(ulong)local_850;
        if (lVar11 - 1U <= (ulong)local_850) goto LAB_003f9138;
        goto LAB_003f9020;
      }
      lVar11 = (ulong)(uVar20 + 1) * 8;
                    /* try { // try from 003f90ec to 003f922f has its CatchHandler @ 003f9710 */
      fVar22 = (float)pointToLineMinGridDis
                                (*(int *)(lVar10 + (ulong)uVar20 * 8),
                                 *(int *)(lVar10 + (ulong)uVar20 * 8 + 4),*(int *)(lVar10 + lVar11),
                                 *(int *)(lVar10 + lVar11 + 4),*(int *)(lVar10 + uVar12 * 8),
                                 *(int *)(lVar10 + uVar12 * 8 + 4));
      uVar12 = (ulong)local_850;
      uVar19 = uVar20 + 1;
    } while (dVar1 <= (double)fVar22);
    local_820 = (void *)CONCAT44(local_820._4_4_,local_850);
    uVar19 = local_850;
    while (uVar19 < uVar20) {
      if (local_838 == local_830) {
        std::vector<unsigned_int,std::allocator<unsigned_int>>::
        _M_realloc_insert<unsigned_int_const&>
                  ((vector<unsigned_int,std::allocator<unsigned_int>> *)&local_840,local_838,
                   &local_820);
        uVar19 = (int)local_820 + 1;
        local_820 = (void *)CONCAT44(local_820._4_4_,uVar19);
      }
      else {
        *(uint *)local_838 = (uint)uVar12;
        uVar19 = (int)local_820 + 1;
        local_820._4_4_ = (undefined4)((ulong)local_820 >> 0x20);
        local_820 = (void *)CONCAT44(local_820._4_4_,uVar19);
        local_838 = local_838 + 4;
      }
      uVar12 = (ulong)uVar19;
    }
    lVar10 = *(long *)param_1;
    local_850 = uVar20 + 2;
    paVar16 = (allocator *)(ulong)local_850;
  } while ((ulong)local_850 < (*(long *)(param_1 + 8) - lVar10 >> 3) - 1U);
LAB_003f9138:
  if (local_840 == local_838) {
LAB_003f942c:
    if (*param_2 < 2) {
                    /* try { // try from 003f9440 to 003f9443 has its CatchHandler @ 003f9710 */
      std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::vector
                ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)&local_820,param_1);
      puVar2 = local_818;
      pvVar7 = local_820;
      uVar12 = (ulong)((long)local_818 - (long)local_820 >> 3) >> 1;
      puVar8 = (undefined8 *)((long)local_820 + uVar12 * 8);
      uVar21 = (long)local_818 - (long)puVar8;
      if ((long)uVar21 < 0) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 003f96a8 to 003f96ab has its CatchHandler @ 003f9718 */
        std::__throw_length_error("cannot create std::vector larger than max_size()");
      }
      if ((long)uVar21 >> 3 == 0) {
        puVar6 = (undefined8 *)0x0;
      }
      else {
                    /* try { // try from 003f9470 to 003f9543 has its CatchHandler @ 003f9718 */
        puVar6 = ::operator_new(uVar21);
      }
      puVar15 = puVar6;
      if (puVar2 != puVar8) {
        uVar14 = (long)puVar2 + (-8 - (long)puVar8);
        uVar18 = uVar14 >> 3;
        if (puVar6 < (undefined8 *)((long)pvVar7 + uVar12 * 8 + 0x10) && puVar8 < puVar6 + 2 ||
            (uVar18 & 0x1ffffffffffffffc) == 0) {
          do {
            puVar9 = puVar8 + 1;
            *puVar15 = *puVar8;
            puVar8 = puVar9;
            puVar15 = puVar15 + 1;
          } while (puVar2 != puVar9);
        }
        else {
          uVar18 = uVar18 + 1;
          lVar10 = 0;
          do {
            uVar5 = *(undefined8 *)((long)puVar8 + lVar10);
            ((undefined8 *)((long)puVar6 + lVar10))[1] = ((undefined8 *)((long)puVar8 + lVar10))[1];
            *(undefined8 *)((long)puVar6 + lVar10) = uVar5;
            lVar10 = lVar10 + 0x10;
          } while ((uVar18 >> 1) * 0x10 - lVar10 != 0);
          if ((uVar18 & 1) != 0) {
            puVar6[uVar18 & 0xfffffffffffffffe] = puVar8[uVar18 & 0xfffffffffffffffe];
          }
        }
        puVar15 = (undefined8 *)((long)puVar6 + uVar14 + 8);
      }
      pvVar7 = *(void **)param_1;
      *(undefined8 **)param_1 = puVar6;
      *(undefined8 **)(param_1 + 8) = puVar15;
      *(ulong *)(param_1 + 0x10) = (long)puVar6 + uVar21;
      if (pvVar7 != (void *)0x0) {
        ::operator_delete(pvVar7);
      }
      uVar21 = 0;
      if (uVar12 != 0) {
        do {
          puVar8 = *(undefined8 **)(param_1 + 8);
          if (puVar8 == *(undefined8 **)(param_1 + 0x10)) {
            std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::
            _M_realloc_insert<cv::Point_<int>const&>
                      ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)param_1,puVar8,
                       (void *)((long)local_820 + uVar21 * 8));
          }
          else {
            *puVar8 = *(undefined8 *)((long)local_820 + uVar21 * 8);
            *(undefined8 **)(param_1 + 8) = puVar8 + 1;
          }
          uVar21 = uVar21 + 1;
        } while (uVar12 != uVar21);
      }
                    /* try { // try from 003f95f0 to 003f95f3 has its CatchHandler @ 003f9718 */
      removeSelfIntersection(param_1,param_2);
      goto LAB_003f930c;
    }
  }
  else {
LAB_003f9144:
    lVar10 = *(long *)param_1;
    lVar11 = *(long *)(param_1 + 8);
    local_820 = (void *)0x0;
    local_818 = (undefined8 *)0x0;
    local_810 = (undefined8 *)0x0;
    uVar12 = 0;
    if (lVar11 != lVar10) {
      do {
        lVar13 = (long)local_838 - (long)local_840;
        paVar16 = (allocator *)(lVar13 >> 4);
        uVar19 = (uint)uVar12;
        paVar17 = local_840;
        if (0 < (long)paVar16) {
          paVar16 = local_840 + (long)paVar16 * 0x10;
          do {
            if (uVar19 == *(uint *)paVar17) goto LAB_003f91c0;
            if (uVar19 == *(uint *)(paVar17 + 4)) {
              paVar17 = paVar17 + 4;
              goto LAB_003f91c0;
            }
            if (uVar19 == *(uint *)(paVar17 + 8)) {
              paVar17 = paVar17 + 8;
              goto LAB_003f91c0;
            }
            if (uVar19 == *(uint *)(paVar17 + 0xc)) {
              paVar17 = paVar17 + 0xc;
              goto LAB_003f91c0;
            }
            paVar17 = paVar17 + 0x10;
          } while (paVar16 != paVar17);
          lVar13 = (long)local_838 - (long)paVar17;
        }
        lVar13 = lVar13 >> 2;
        if (lVar13 == 2) {
LAB_003f93cc:
          if (uVar19 != *(uint *)paVar17) {
            paVar17 = paVar17 + 4;
LAB_003f93dc:
            if (uVar19 != *(uint *)paVar17) goto joined_r0x003f93f4;
          }
LAB_003f91c0:
          if (paVar17 == local_838) goto joined_r0x003f93f4;
        }
        else {
          if (lVar13 == 3) {
            if (uVar19 != *(uint *)paVar17) {
              paVar17 = paVar17 + 4;
              goto LAB_003f93cc;
            }
            goto LAB_003f91c0;
          }
          if (lVar13 == 1) goto LAB_003f93dc;
joined_r0x003f93f4:
          paVar16 = (allocator *)(lVar10 + uVar12 * 8);
          if (local_818 == local_810) {
            std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::
            _M_realloc_insert<cv::Point_<int>const&>
                      ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)&local_820);
            lVar10 = *(long *)param_1;
            lVar11 = *(long *)(param_1 + 8);
          }
          else {
            *local_818 = *(undefined8 *)(lVar10 + uVar12 * 8);
            local_818 = local_818 + 1;
          }
        }
        uVar12 = (ulong)(uVar19 + 1);
      } while (uVar12 < (ulong)(lVar11 - lVar10 >> 3));
    }
                    /* try { // try from 003f927c to 003f92a3 has its CatchHandler @ 003f96c0 */
    std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::operator=
              ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)param_1,
               (vector *)&local_820);
                    /* try { // try from 003f95f8 to 003f967b has its CatchHandler @ 003f96c0 */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (iVar4 = rcutils_logging_initialize(), iVar4 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:180] error initializing logging: "
             ,1,0x65,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_808);
      rcutils_get_error_string(local_408);
      __n = strlen((char *)local_408);
      fwrite(auStack_808,1,__n,*(FILE **)PTR_stderr_004deec0);
      paVar16 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar16);
                    /* try { // try from 003f92b0 to 003f92b3 has its CatchHandler @ 003f9730 */
    rclcpp::get_logger((string *)local_408);
    uVar5 = 0;
    if ((undefined8 *)CONCAT44(uStack_84c,local_850) != (undefined8 *)0x0) {
      uVar5 = *(undefined8 *)CONCAT44(uStack_84c,local_850);
    }
                    /* try { // try from 003f92c4 to 003f92c7 has its CatchHandler @ 003f96e4 */
    cVar3 = rcutils_logging_logger_is_enabled_for(uVar5,0x1e);
    if (local_848 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_848);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
    if (cVar3 != '\0') {
                    /* try { // try from 003f9564 to 003f9567 has its CatchHandler @ 003f96c0 */
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar16);
                    /* try { // try from 003f9570 to 003f9573 has its CatchHandler @ 003f973c */
      rclcpp::get_logger((string *)local_408);
      uVar5 = 0;
      if ((undefined8 *)CONCAT44(uStack_84c,local_850) != (undefined8 *)0x0) {
        uVar5 = *(undefined8 *)CONCAT44(uStack_84c,local_850);
      }
                    /* try { // try from 003f95a4 to 003f95a7 has its CatchHandler @ 003f9738 */
      rcutils_log(removeSelfIntersection(std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>&,int&)
                  ::__rcutils_logging_location,0x1e,uVar5,
                  "Remove self intersection poly, removed size: %zu!!!",
                  (long)local_838 - (long)local_840 >> 2);
      if (local_848 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_848);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
    }
    if (*param_2 < 9) {
                    /* try { // try from 003f9308 to 003f93ff has its CatchHandler @ 003f96c0 */
      removeSelfIntersection(param_1,param_2);
    }
LAB_003f930c:
    if (local_820 != (void *)0x0) {
      ::operator_delete(local_820);
    }
  }
  if (local_840 != (allocator *)0x0) {
    ::operator_delete(local_840);
  }
LAB_003f9334:
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return;
}



// ===== coverage_plan::DoEdgesIntersect @ 003febc0 =====

/* coverage_plan::DoEdgesIntersect(CGAL::Polygon_2<CGAL::Epeck,
   std::vector<CGAL::Point_2<CGAL::Epeck>, std::allocator<CGAL::Point_2<CGAL::Epeck> > > > const&,
   CGAL::Polygon_2<CGAL::Epeck, std::vector<CGAL::Point_2<CGAL::Epeck>,
   std::allocator<CGAL::Point_2<CGAL::Epeck> > > > const&) */

bool coverage_plan::DoEdgesIntersect(Polygon_2 *param_1,Polygon_2 *param_2)

{
  long *plVar1;
  int iVar2;
  undefined8 uVar3;
  undefined *puVar4;
  undefined *puVar5;
  bool bVar6;
  long *plVar7;
  long *plVar8;
  long *plVar9;
  long *plVar10;
  long lVar11;
  long lVar12;
  long *plVar13;
  void *pvVar14;
  void *pvVar15;
  void *pvVar16;
  void *pvVar17;
  long *local_108;
  long *local_100;
  Static_filters aSStack_f8 [16];
  double local_e8;
  double dStack_e0;
  double local_d8;
  double dStack_d0;
  double local_c8;
  double dStack_c0;
  double local_b8;
  double dStack_b0;
  long local_a8;
  long lStack_a0;
  long local_98;
  long local_90;
  double local_88;
  double dStack_80;
  double local_78;
  double dStack_70;
  long local_68;
  long lStack_60;
  long local_58;
  long lStack_50;
  long local_8;
  
  puVar4 = PTR_vtable_004dec40;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  plVar7 = *(long **)(param_1 + 8);
  if (*(long **)param_1 != plVar7) {
    plVar10 = *(long **)(param_2 + 8);
    plVar13 = *(long **)param_1;
    do {
      plVar1 = plVar13 + 1;
      if (*(long **)param_2 != plVar10) {
        plVar9 = *(long **)param_2;
        do {
          plVar10 = plVar1;
          if (plVar7 == plVar1) {
            plVar10 = *(long **)param_1;
          }
          uVar3 = fpcr;
          fpcr = 0x400000;
                    /* try { // try from 003fec5c to 003fec5f has its CatchHandler @ 003ff1e4 */
          plVar7 = ::operator_new(0x68);
          lVar12 = *plVar13;
          lVar11 = *plVar10;
          local_c8 = *(double *)(lVar12 + 0x10);
          dStack_c0 = *(double *)(lVar12 + 0x18);
          local_b8 = *(double *)(lVar12 + 0x20);
          dStack_b0 = *(double *)(lVar12 + 0x28);
          local_a8 = *(long *)(lVar11 + 0x10);
          lStack_a0 = *(long *)(lVar11 + 0x18);
          local_98 = *(long *)(lVar11 + 0x20);
          local_90 = *(long *)(lVar11 + 0x28);
          plVar7[2] = (long)local_c8;
          plVar7[3] = (long)dStack_c0;
          plVar10 = (long *)*plVar10;
          *(undefined4 *)(plVar7 + 1) = 1;
          plVar7[0xb] = (long)plVar10;
          plVar7[4] = (long)local_b8;
          plVar7[5] = (long)dStack_b0;
          lVar11 = plVar10[1];
          plVar7[6] = local_a8;
          plVar7[7] = lStack_a0;
          plVar7[8] = local_98;
          plVar8 = (long *)*plVar13;
          *plVar7 = (long)(puVar4 + 0x10);
          plVar7[9] = local_90;
          plVar7[10] = 0;
          *(int *)(plVar10 + 1) = (int)lVar11 + 1;
          plVar7[0xc] = (long)plVar8;
          iVar2 = (int)plVar8[1];
          *(int *)(plVar8 + 1) = iVar2 + 1;
          local_108 = plVar7;
          local_88 = local_c8;
          dStack_80 = dStack_c0;
          local_78 = local_b8;
          dStack_70 = dStack_b0;
          local_68 = local_a8;
          lStack_60 = lStack_a0;
          local_58 = local_98;
          lStack_50 = local_90;
          if ((int)plVar7[1] == 0) {
            *plVar7 = (long)(puVar4 + 0x10);
            *(int *)(plVar8 + 1) = iVar2;
            if (iVar2 == 0) {
              (**(code **)(*plVar8 + 8))();
              plVar10 = (long *)plVar7[0xb];
              if (plVar10 != (long *)0x0) goto LAB_003ff054;
            }
            else {
LAB_003ff054:
              iVar2 = (int)plVar10[1] + -1;
              *(int *)(plVar10 + 1) = iVar2;
              if (iVar2 == 0) {
                (**(code **)(*plVar10 + 8))(plVar10);
              }
            }
            pvVar16 = (void *)plVar7[10];
            *plVar7 = (long)(PTR_vtable_004de220 + 0x10);
            if (pvVar16 != (void *)0x0) {
              pvVar15 = (void *)((long)pvVar16 + 0x80);
              do {
                pvVar17 = (void *)((long)pvVar15 + -0x40);
                do {
                  pvVar14 = (void *)((long)pvVar15 + -0x20);
                  if ((*(long *)((long)pvVar15 + -0x18) != 0) ||
                     (*(long *)((long)pvVar15 + -8) != 0)) {
                    __gmpq_clear(pvVar14);
                  }
                  pvVar15 = pvVar14;
                } while (pvVar17 != pvVar14);
                pvVar15 = pvVar17;
              } while (pvVar16 != pvVar17);
              ::operator_delete(pvVar16,0x80);
            }
            ::operator_delete(plVar7,0x68);
          }
          fpcr = uVar3;
          plVar10 = plVar9 + 1;
          plVar7 = plVar10;
          if (plVar10 == *(long **)(param_2 + 8)) {
            plVar7 = *(long **)param_2;
          }
          uVar3 = fpcr;
          fpcr = 0x400000;
                    /* try { // try from 003fed98 to 003fed9b has its CatchHandler @ 003ff150 */
          plVar8 = ::operator_new(0x68);
          lVar11 = *plVar9;
          lVar12 = *plVar7;
          local_c8 = *(double *)(lVar11 + 0x10);
          dStack_c0 = *(double *)(lVar11 + 0x18);
          plVar7 = (long *)*plVar7;
          local_b8 = *(double *)(lVar11 + 0x20);
          dStack_b0 = *(double *)(lVar11 + 0x28);
          local_a8 = *(long *)(lVar12 + 0x10);
          lStack_a0 = *(long *)(lVar12 + 0x18);
          local_98 = *(long *)(lVar12 + 0x20);
          local_90 = *(long *)(lVar12 + 0x28);
          *(undefined4 *)(plVar8 + 1) = 1;
          plVar8[0xb] = (long)plVar7;
          puVar5 = PTR_vtable_004dec40;
          plVar8[8] = local_98;
          plVar8[9] = local_90;
          lVar11 = plVar7[1];
          plVar9 = (long *)*plVar9;
          *plVar8 = (long)(puVar5 + 0x10);
          plVar8[2] = (long)local_c8;
          plVar8[3] = (long)dStack_c0;
          plVar8[4] = (long)local_b8;
          plVar8[5] = (long)dStack_b0;
          plVar8[6] = local_a8;
          plVar8[7] = lStack_a0;
          plVar8[10] = 0;
          *(int *)(plVar7 + 1) = (int)lVar11 + 1;
          plVar8[0xc] = (long)plVar9;
          iVar2 = (int)plVar9[1];
          *(int *)(plVar9 + 1) = iVar2 + 1;
          local_100 = plVar8;
          local_88 = local_c8;
          dStack_80 = dStack_c0;
          local_78 = local_b8;
          dStack_70 = dStack_b0;
          local_68 = local_a8;
          lStack_60 = lStack_a0;
          local_58 = local_98;
          lStack_50 = local_90;
          if ((int)plVar8[1] == 0) {
            *plVar8 = (long)(puVar5 + 0x10);
            *(int *)(plVar9 + 1) = iVar2;
            if (iVar2 == 0) {
              (**(code **)(*plVar9 + 8))();
              plVar7 = (long *)plVar8[0xb];
              if (plVar7 != (long *)0x0) goto LAB_003ff078;
            }
            else {
LAB_003ff078:
              iVar2 = (int)plVar7[1] + -1;
              *(int *)(plVar7 + 1) = iVar2;
              if (iVar2 == 0) {
                (**(code **)(*plVar7 + 8))(plVar7);
              }
            }
            pvVar16 = (void *)plVar8[10];
            *plVar8 = (long)(PTR_vtable_004de220 + 0x10);
            if (pvVar16 != (void *)0x0) {
              pvVar15 = (void *)((long)pvVar16 + 0x80);
              do {
                pvVar17 = (void *)((long)pvVar15 + -0x40);
                do {
                  pvVar14 = (void *)((long)pvVar15 + -0x20);
                  if ((*(long *)((long)pvVar15 + -0x18) != 0) ||
                     (*(long *)((long)pvVar15 + -8) != 0)) {
                    __gmpq_clear(pvVar14);
                  }
                  pvVar15 = pvVar14;
                } while (pvVar17 != pvVar14);
                pvVar15 = pvVar17;
              } while (pvVar16 != pvVar17);
              ::operator_delete(pvVar16,0x80);
            }
            ::operator_delete(plVar8,0x68);
          }
          fpcr = uVar3;
          local_c8 = -(double)local_108[2];
          if (((((double)local_108[3] == local_c8) &&
               (dStack_c0 = -(double)local_108[4], (double)local_108[5] == dStack_c0)) &&
              (local_b8 = -(double)local_108[6], (double)local_108[7] == local_b8)) &&
             (dStack_b0 = -(double)local_108[8], (double)local_108[9] == dStack_b0)) {
            local_a8 = CONCAT71(local_a8._1_7_,1);
            local_88 = -(double)local_100[2];
            if ((((double)local_100[3] != local_88) ||
                (dStack_80 = -(double)local_100[4], (double)local_100[5] != dStack_80)) ||
               ((local_78 = -(double)local_100[6], (double)local_100[7] != local_78 ||
                (dStack_70 = -(double)local_100[8], (double)local_100[9] != dStack_70)))) {
              local_68 = (ulong)local_68._1_7_ << 8;
              local_88 = local_e8;
              dStack_80 = dStack_e0;
              local_78 = local_d8;
              dStack_70 = dStack_d0;
              goto LAB_003ff010;
            }
            local_68 = CONCAT71(local_68._1_7_,1);
                    /* try { // try from 003fef78 to 003ff01f has its CatchHandler @ 003ff0f8 */
            bVar6 = CGAL::Intersections::internal::
                    do_intersect<CGAL::internal::Static_filters<CGAL::Filtered_kernel_base<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>>>>
                              ((Segment_2 *)&local_c8,(Segment_2 *)&local_88,aSStack_f8);
          }
          else {
            local_c8 = local_88;
            dStack_c0 = dStack_80;
            local_b8 = local_78;
            dStack_b0 = dStack_70;
            local_a8 = (ulong)local_a8._1_7_ << 8;
LAB_003ff010:
            bVar6 = CGAL::
                    Filtered_predicate<CGAL::CommonKernelFunctors::Do_intersect_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Do_intersect_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                    ::operator()((Filtered_predicate<CGAL::CommonKernelFunctors::Do_intersect_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CommonKernelFunctors::Do_intersect_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>
                                  *)aSStack_f8,(Segment_2 *)&local_108,(Segment_2 *)&local_100);
          }
          if ((local_100 != (long *)0x0) &&
             (iVar2 = (int)local_100[1] + -1, *(int *)(local_100 + 1) = iVar2, iVar2 == 0)) {
            (**(code **)(*local_100 + 8))();
          }
          if ((local_108 != (long *)0x0) &&
             (iVar2 = (int)local_108[1] + -1, *(int *)(local_108 + 1) = iVar2, iVar2 == 0)) {
            (**(code **)(*local_108 + 8))();
          }
          if (bVar6 != false) goto LAB_003ff0b8;
          plVar7 = *(long **)(param_1 + 8);
          plVar9 = plVar10;
        } while (*(long **)(param_2 + 8) != plVar10);
      }
      plVar13 = plVar1;
    } while (plVar7 != plVar1);
  }
  bVar6 = false;
LAB_003ff0b8:
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return bVar6;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::BsdTspPlanner::getPlan @ 003ff678 =====

/* WARNING: Heritage AFTER dead removal. Example location: x0 : 0x0040095c */
/* WARNING: Removing unreachable block (ram,0x0040470c) */
/* WARNING: Removing unreachable block (ram,0x0040468c) */
/* WARNING: Removing unreachable block (ram,0x0040460c) */
/* WARNING: Removing unreachable block (ram,0x0040480c) */
/* WARNING: Removing unreachable block (ram,0x00403628) */
/* WARNING: Removing unreachable block (ram,0x0040478c) */
/* WARNING: Removing unreachable block (ram,0x0040440c) */
/* WARNING: Removing unreachable block (ram,0x0040450c) */
/* WARNING: Removing unreachable block (ram,0x0040448c) */
/* WARNING: Removing unreachable block (ram,0x004042a8) */
/* WARNING: Type propagation algorithm not settling */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* WARNING: Restarted to delay deadcode elimination for space: register */
/* coverage_plan::BsdTspPlanner::getPlan(int, int, cv::Mat const&, cv::Mat const&, bool, unsigned
   char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

char __thiscall
coverage_plan::BsdTspPlanner::getPlan
          (BsdTspPlanner *this,int param_1,int param_2,Mat *param_3,Mat *param_4,bool param_5,
          uchar param_6,map *param_7)

{
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *p_Var1;
  Point_2 *pPVar2;
  Point_2 *pPVar3;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *p_Var4;
  int iVar5;
  int iVar6;
  int iVar7;
  undefined8 *puVar8;
  void *******pppppppvVar9;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *pvVar10;
  code *pcVar11;
  allocator *paVar12;
  allocator *paVar13;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *p_Var14;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *p_Var15;
  Mat *pMVar16;
  _Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
  *this_00;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *pvVar17;
  Lazy_exact_nt *pLVar18;
  Lazy_exact_nt *pLVar19;
  double dVar20;
  undefined8 uVar21;
  double dVar22;
  double dVar23;
  Polygon_2 *pPVar24;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *pvVar25;
  Lazy_exact_nt *pLVar26;
  Mat *pMVar27;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *pvVar28;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *p_Var29;
  uint *puVar30;
  char cVar31;
  char cVar32;
  bool bVar33;
  int extraout_w0;
  uint uVar34;
  uint uVar35;
  int iVar36;
  clock_t cVar37;
  undefined8 uVar38;
  clock_t cVar39;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *pvVar40;
  undefined8 uVar41;
  allocator *paVar42;
  uint *__s;
  uint *puVar43;
  void *pvVar44;
  undefined8 *puVar45;
  Lazy_exact_nt *pLVar46;
  long *plVar47;
  long *plVar48;
  long *plVar49;
  clock_t cVar50;
  char *pcVar51;
  long lVar52;
  Lazy_exact_Sub<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>
  *this_01;
  Point_2 *pPVar53;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *pvVar54;
  undefined *puVar55;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *pvVar56;
  undefined *puVar57;
  size_t sVar58;
  int extraout_w1;
  int extraout_w1_00;
  ulong uVar59;
  code *pcVar60;
  Lazy_exact_nt *extraout_x1;
  undefined8 *puVar61;
  Lazy_exact_nt *extraout_x1_00;
  Point_2 *extraout_x1_01;
  Lazy_exact_nt *extraout_x1_02;
  Lazy_exact_nt *extraout_x1_03;
  Point_2 *extraout_x1_04;
  Lazy_exact_nt *extraout_x1_05;
  Point_2 *extraout_x1_06;
  Point_2 *extraout_x1_07;
  Point_2 *extraout_x1_08;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *extraout_x1_09;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *extraout_x1_10;
  Lazy_exact_nt *extraout_x1_11;
  Lazy_exact_nt *extraout_x1_12;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *extraout_x1_13;
  allocator *paVar63;
  Point_ *pPVar64;
  long *plVar65;
  Epeck *pEVar66;
  ulong uVar67;
  undefined8 *puVar68;
  Point_2 *pPVar69;
  _InputArray *p_Var70;
  uint *puVar71;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *pvVar72;
  Point_ *pPVar73;
  undefined **ppuVar74;
  undefined **ppuVar75;
  int *piVar76;
  long lVar77;
  vector *pvVar78;
  ulong uVar79;
  int *piVar80;
  Mat *pMVar81;
  Polygon_2 *pPVar82;
  Point_2 *pPVar83;
  void *******pppppppvVar84;
  long lVar85;
  Point_2 *pPVar86;
  int *piVar87;
  void *pvVar88;
  Point_2 *pPVar89;
  vector *pvVar90;
  int *piVar91;
  Point_2 *pPVar92;
  long lVar93;
  Point_2 *pPVar94;
  void *pvVar95;
  Mat *pMVar96;
  double dVar97;
  double dVar98;
  long lVar99;
  double dVar100;
  double dVar101;
  long lVar102;
  long lVar103;
  undefined8 *puVar104;
  undefined1 auVar105 [16];
  undefined8 *local_f80;
  int *local_f70;
  ulong local_f48;
  int local_f2c;
  double local_e68;
  double dStack_e60;
  int local_e58;
  int local_e54 [4];
  int local_e44;
  long *local_e40;
  long *local_e38;
  long *local_e30;
  uint local_e28;
  int local_e24;
  long *local_e20 [2];
  long local_e10;
  undefined8 uStack_e08;
  undefined8 local_e00;
  void *local_df0;
  void *pvStack_de8;
  undefined8 local_de0;
  int *local_dd0;
  int *local_dc8;
  int *local_dc0;
  int *local_db0;
  int *piStack_da8;
  undefined8 local_da0;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_d90;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_d88;
  undefined8 local_d80;
  vector *local_d70;
  vector *pvStack_d68;
  undefined8 local_d60;
  undefined8 *local_d50;
  undefined8 *puStack_d48;
  long local_d40;
  undefined8 *local_d30;
  undefined8 *local_d28;
  undefined8 *local_d20;
  Polygon_2 *local_d10;
  Polygon_2 *local_d08;
  undefined8 local_d00;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_cf0;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_ce8;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *local_ce0;
  Point_2 *local_cd0;
  Point_2 *pPStack_cc8;
  undefined8 local_cc0;
  long *local_cb0;
  undefined8 uStack_ca8;
  undefined8 local_ca0;
  Point_2 *local_c90;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_c88;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_c80;
  Point_ *local_c78;
  long local_c70;
  int *local_c60;
  int *local_c58;
  Lazy_exact_nt *local_c48;
  Lazy_exact_nt *local_c40;
  undefined8 local_c30;
  undefined8 uStack_c28;
  undefined8 local_c20;
  allocator aaStack_c18 [8];
  undefined8 local_c10;
  undefined8 uStack_c08;
  undefined8 local_c00;
  undefined8 local_bf0;
  undefined8 local_be8;
  undefined8 local_be0;
  void *local_bd0;
  sp_counted_base *local_bc8;
  int *local_bc0;
  int *local_bb0;
  undefined8 *local_ba8;
  int *local_ba0;
  long local_b98;
  long local_b88;
  Mat *local_b80;
  Mat *pMStack_b78;
  undefined8 local_b70;
  undefined8 local_b60;
  undefined8 local_b58;
  undefined8 local_b50;
  undefined8 uStack_b48;
  undefined8 local_b40;
  undefined8 uStack_b38;
  undefined8 local_b30;
  undefined8 uStack_b28;
  undefined8 local_b20;
  undefined8 uStack_b18;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_b10;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *pvStack_b08;
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  *local_b00;
  undefined8 local_af0;
  undefined8 local_ae8;
  undefined8 local_ae0;
  undefined8 uStack_ad8;
  undefined8 local_ad0;
  undefined8 uStack_ac8;
  undefined8 local_ac0;
  undefined8 uStack_ab8;
  undefined8 local_ab0;
  undefined8 uStack_aa8;
  undefined8 local_aa0;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_a98;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *p_Stack_a90;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
  *local_a88;
  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>,std::_Select1st<std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>>>
  a_Stack_a80 [8];
  void *local_a78;
  _Rb_tree_node *local_a70;
  void *local_a60;
  _Rb_tree<std::pair<unsigned_long,unsigned_long>,std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>,std::_Select1st<std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>>,std::less<std::pair<unsigned_long,unsigned_long>>,std::allocator<std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>>>
  a_Stack_a50 [8];
  void *local_a48;
  void *local_a40;
  void *******local_a30 [3];
  void *local_a18;
  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> avStack_a08 [32];
  deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
  adStack_9e8 [24];
  long *local_9d0;
  long *local_9c8;
  sp_counted_base *local_9a8;
  stringstream asStack_990 [16];
  ostream aoStack_980 [376];
  undefined1 *local_808 [2];
  undefined1 auStack_7f8 [1008];
  undefined1 *local_408 [2];
  undefined1 auStack_3f8 [1008];
  long local_8;
  undefined8 *puVar62;
  
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  local_e58 = param_2;
  local_e54[0] = param_1;
  cVar37 = clock();
  local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)&local_df0;
  uStack_e08 = 0;
  local_e10 = 0;
  local_e00 = 0;
  pvStack_de8 = (void *)0x0;
  local_df0 = (void *)0x0;
  local_de0 = 0;
  local_bd0 = (void *)0x0;
  local_b80 = (Mat *)CONCAT44(local_b80._4_4_,0x1010000);
  local_b70 = 0;
  local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)CONCAT44(local_b10._4_4_,0x8204000c);
  local_b00 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0;
  local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)CONCAT44(local_aa0._4_4_,0x8203001c);
  p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                 *)0x0;
  paVar63 = (allocator *)&local_aa0;
  pMStack_b78 = param_4;
  pvStack_b08 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)&local_e10;
                    /* try { // try from 003ff760 to 003ff763 has its CatchHandler @ 004055a0 */
  cv::findContours((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                   &local_b80,(_InputArray *)&local_b10,(_InputArray *)&local_aa0,3,2);
  pvVar44 = pvStack_de8;
  local_dd0 = (int *)0x0;
  local_dc8 = (int *)0x0;
  iVar5 = *(int *)(param_4 + 8);
  iVar6 = *(int *)(param_4 + 0xc);
  local_e44 = 0;
  local_dc0 = (int *)0x0;
  if (pvStack_de8 == local_df0) goto LAB_003ff99c;
  pvVar88 = local_df0;
  do {
    while (-1 < *(int *)((long)pvVar88 + 0xc)) {
LAB_003ff7c8:
      local_e44 = (int)cVar37 + 1;
      pvVar88 = (void *)((long)pvVar88 + 0x10);
      if (pvVar44 == pvVar88) goto LAB_003ff858;
    }
    p_Var4 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)(local_e10 + (long)local_e44 * 0x18);
    paVar63 = *(allocator **)(local_e10 + (long)local_e44 * 0x18);
    if ((ulong)((long)*(void **)(p_Var4 + 8) - (long)paVar63) < 0x18) goto LAB_003ff7c8;
    local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)CONCAT44(local_aa0._4_4_,0x8103000c);
    p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                   *)0x0;
    local_a98 = p_Var4;
                    /* try { // try from 003ff818 to 003ff94f has its CatchHandler @ 00405a7c */
    dVar97 = (double)cv::contourArea((_InputArray *)&local_aa0,false);
    if (dVar97 <= 200.0) goto LAB_003ff7c8;
    if (local_dc8 == local_dc0) {
      paVar63 = (allocator *)&local_e44;
                    /* try { // try from 003fffbc to 003fffbf has its CatchHandler @ 00405a7c */
      std::vector<int,std::allocator<int>>::_M_realloc_insert<int_const&>
                ((vector<int,std::allocator<int>> *)&local_dd0);
      goto LAB_003ff7c8;
    }
    pvVar88 = (void *)((long)pvVar88 + 0x10);
    piVar76 = local_dc8 + 1;
    *local_dc8 = local_e44;
    local_e44 = local_e44 + 1;
    local_dc8 = piVar76;
  } while (pvVar44 != pvVar88);
LAB_003ff858:
  piVar80 = local_dc8;
  piVar76 = local_dd0;
  lVar77 = (long)local_dc8 - (long)local_dd0;
  uVar59 = lVar77 >> 2;
  if (local_dd0 != local_dc8) {
    uVar34 = 0x3f - (int)LZCOUNT(uVar59);
    std::
    __introsort_loop<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,long,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
              (local_dd0,local_dc8,
               -(ulong)(uVar34 >> 0x1f) & 0xfffffffe00000000 | (ulong)uVar34 << 1,
               (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                *)&local_e10);
    paVar63 = (allocator *)&local_e10;
    if (lVar77 < 0x41) {
                    /* try { // try from 0040398c to 004039b3 has its CatchHandler @ 00405a7c */
      std::
      __insertion_sort<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
                (piVar76,piVar80);
    }
    else {
      piVar91 = piVar76 + 0x10;
      std::
      __insertion_sort<__gnu_cxx::__normal_iterator<int*,std::vector<int,std::allocator<int>>>,__gnu_cxx::__ops::_Iter_comp_iter<coverage_plan::BsdTspPlanner::getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)::_lambda(int,int)_1_>>
                (piVar76,piVar91);
      if (piVar80 != piVar91) {
        do {
          iVar36 = *piVar91;
          piVar76 = piVar91;
          local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                       *)&local_e10;
          while( true ) {
            paVar63 = (allocator *)(ulong)(uint)piVar76[-1];
            cVar31 = makeBoundaryFollowPlan(cv::Mat_const&,std::map<int,std::vector<coverage_plan::GridPos,std::allocator<coverage_plan::GridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::GridPos,std::allocator<coverage_plan::GridPos>>>>>*)
                     ::{lambda(int,int)#1}::operator()
                               ((_lambda_int_int__1_ *)&local_aa0,iVar36,piVar76[-1]);
            if (cVar31 == '\0') break;
            *piVar76 = piVar76[-1];
            piVar76 = piVar76 + -1;
          }
          *piVar76 = iVar36;
          piVar91 = piVar91 + 1;
        } while (piVar80 != piVar91);
        uVar59 = (long)local_dc8 - (long)local_dd0 >> 2;
        goto LAB_003ff91c;
      }
    }
    uVar59 = (long)local_dc8 - (long)local_dd0 >> 2;
  }
LAB_003ff91c:
  if (1 < uVar59) {
                    /* try { // try from 00404218 to 0040431b has its CatchHandler @ 00405a7c */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (rcutils_logging_initialize(), (int)uVar59 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:242] error initializing logging: "
             ,1,0x65,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(local_808);
      rcutils_get_error_string(local_408);
      sVar58 = strlen((char *)local_408);
      fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
      paVar63 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ff958 to 003ff95b has its CatchHandler @ 004055cc */
    rclcpp::get_logger((string *)local_408);
    uVar38 = 0;
    if (local_aa0 !=
        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
         *)0x0) {
      uVar38 = *(undefined8 *)local_aa0;
    }
                    /* try { // try from 003ff96c to 003ff96f has its CatchHandler @ 00405490 */
    cVar31 = rcutils_logging_logger_is_enabled_for(uVar38,0x1e);
    if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
    if (cVar31 != '\0') {
                    /* try { // try from 00403c38 to 00403c3b has its CatchHandler @ 00405a7c */
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00403c44 to 00403c47 has its CatchHandler @ 00404a8c */
      rclcpp::get_logger((string *)local_408);
      paVar63 = (allocator *)0x0;
      if (local_aa0 !=
          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
           *)0x0) {
        paVar63 = *(allocator **)local_aa0;
      }
                    /* try { // try from 00403c6c to 00403c6f has its CatchHandler @ 00404a80 */
      rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                  ::__rcutils_logging_location,0x1e,paVar63,
                  "Containing mul area, please make sure passage ok for mul area");
      if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
    }
  }
LAB_003ff99c:
  if (((long)pvStack_de8 - (long)local_df0 == 0x10) && (local_dd0 == local_dc8)) {
    local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)((ulong)local_aa0 & 0xffffffff00000000);
                    /* try { // try from 00403ca0 to 00403ca3 has its CatchHandler @ 00405a7c */
    std::vector<int,std::allocator<int>>::emplace_back<int>
              ((vector<int,std::allocator<int>> *)&local_dd0,(int *)&local_aa0);
  }
  cVar39 = clock();
                    /* try { // try from 0040400c to 004040a3 has its CatchHandler @ 00405a7c */
  if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
     (rcutils_logging_initialize(), (int)cVar39 != 0)) {
    fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:249] error initializing logging: "
           ,1,0x65,*(FILE **)PTR_stderr_004deec0);
    rcutils_get_error_string(local_808);
    rcutils_get_error_string(local_408);
    sVar58 = strlen((char *)local_408);
    fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
    paVar63 = (allocator *)0x1;
    fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
    rcutils_reset_error();
  }
                    /* try { // try from 003ff9f0 to 003ff9f3 has its CatchHandler @ 00405a7c */
  std::__cxx11::string::string<std::allocator<char>>
            ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ff9fc to 003ff9ff has its CatchHandler @ 00405384 */
  rclcpp::get_logger((string *)local_408);
  uVar38 = 0;
  if (local_aa0 !=
      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
       *)0x0) {
    uVar38 = *(undefined8 *)local_aa0;
  }
                    /* try { // try from 003ffa10 to 003ffa13 has its CatchHandler @ 0040538c */
  pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
             *)rcutils_logging_logger_is_enabled_for(uVar38,0x14);
  if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
  }
  if (local_408[0] != auStack_3f8) {
    ::operator_delete(local_408[0]);
  }
  if (((ulong)pvVar40 & 0xff) != 0) {
                    /* try { // try from 00403a28 to 00403a2b has its CatchHandler @ 00405a7c */
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00403a34 to 00403a37 has its CatchHandler @ 00404f90 */
    rclcpp::get_logger((string *)local_408);
    paVar63 = (allocator *)0x0;
    if (local_aa0 !=
        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
         *)0x0) {
      paVar63 = *(allocator **)local_aa0;
    }
                    /* try { // try from 00403a78 to 00403a7b has its CatchHandler @ 00404f60 */
    rcutils_log((double)(cVar39 - cVar37) / 1000000.0,
                getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                ::__rcutils_logging_location,0x14,paVar63,"------1 - Contour time cost: %.2f");
    if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
  }
  piVar76 = local_dc8;
  uVar38 = DAT_0046c910;
  dVar23 = DAT_0046c908;
  dVar22 = DAT_0046c8e0;
  dVar20 = DAT_0045f958;
  dVar97 = DAT_0045f948;
  if (local_dc8 != local_dd0) {
    local_f70 = local_dd0;
    do {
      pvStack_b08 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)(local_e10 + (long)*local_f70 * 0x18);
      piStack_da8 = (int *)0x0;
      local_db0 = (int *)0x0;
      local_da0 = 0;
      uStack_c28 = 0;
      local_c30 = 0;
      local_c20 = 0;
      uStack_c08 = 0;
      local_c10 = 0;
      local_c00 = 0;
      local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)CONCAT44(local_b10._4_4_,0x8103000c);
      local_b00 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)0x0;
      local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)CONCAT44(local_aa0._4_4_,0x8203000c);
      p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                     *)0x0;
      local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)&local_db0;
                    /* try { // try from 003ffb1c to 003ffb1f has its CatchHandler @ 0040586c */
      cv::approxPolyDP((_InputArray *)&local_b10,(_OutputArray *)&local_aa0,dVar22,true);
      piVar80 = piStack_da8;
      if (piStack_da8 != local_db0) {
        puVar57 = PTR_vtable_004de450 + 0x10;
        piVar91 = local_db0;
        do {
          uVar41 = fpcr;
          fpcr = 0x400000;
                    /* try { // try from 003ffb58 to 003ffb5b has its CatchHandler @ 004058a4 */
          pvVar40 = ::operator_new(0x40);
          iVar36 = *piVar91;
          iVar7 = piVar91[1];
          *(undefined **)pvVar40 = puVar57;
          dVar100 = (double)iVar36;
          dVar98 = (double)iVar7;
          *(undefined4 *)(pvVar40 + 8) = 1;
          *(undefined8 *)(pvVar40 + 0x30) = 0;
          *(int *)(pvVar40 + 0x38) = iVar7;
          *(int *)(pvVar40 + 0x3c) = iVar36;
          *(double *)(pvVar40 + 0x28) = dVar98;
          *(double *)(pvVar40 + 0x10) = -dVar100;
          *(double *)(pvVar40 + 0x18) = dVar100;
          *(double *)(pvVar40 + 0x20) = -dVar98;
          fpcr = uVar41;
          local_aa0 = pvVar40;
                    /* try { // try from 003ffba4 to 003ffba7 has its CatchHandler @ 00405874 */
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::insert
                    ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                      *)&local_c30,uStack_c28,(_InputArray *)&local_aa0);
          if ((local_aa0 !=
               (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                *)0x0) &&
             (iVar36 = *(int *)(local_aa0 + 8), *(int *)(local_aa0 + 8) = iVar36 + -1,
             iVar36 + -1 == 0)) {
            (**(code **)(*(long *)local_aa0 + 8))();
          }
          piVar91 = piVar91 + 2;
        } while (piVar80 != piVar91);
      }
      paVar63 = aaStack_c18;
                    /* try { // try from 003ffbe8 to 003ffc0f has its CatchHandler @ 0040586c */
      CGAL::
      orientation_2<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>const*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,CGAL::Epeck>
                (local_c30,uStack_c28);
      extraout_w0 = (int)pvVar40;
                    /* try { // try from 00401fc0 to 0040203b has its CatchHandler @ 0040586c */
      if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
         (rcutils_logging_initialize(), extraout_w0 != 0)) {
        fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:261] error initializing logging: "
               ,1,0x65,*(FILE **)PTR_stderr_004deec0);
        rcutils_get_error_string(local_808);
        rcutils_get_error_string((string *)local_408);
        sVar58 = strlen((char *)local_408);
        fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
        paVar63 = (allocator *)0x1;
        fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
        rcutils_reset_error();
      }
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ffc18 to 003ffc1b has its CatchHandler @ 00405a50 */
      rclcpp::get_logger((string *)local_408);
      uVar41 = 0;
      if (local_aa0 !=
          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
           *)0x0) {
        uVar41 = *(undefined8 *)local_aa0;
      }
                    /* try { // try from 003ffc2c to 003ffc2f has its CatchHandler @ 00405a4c */
      uVar34 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
      if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
      if ((uVar34 & 0xff) != 0) {
                    /* try { // try from 00401da4 to 00401da7 has its CatchHandler @ 0040586c */
        std::__cxx11::string::string<std::allocator<char>>
                  ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401db0 to 00401db3 has its CatchHandler @ 00405a84 */
        rclcpp::get_logger((string *)local_408);
        uVar41 = 0;
        if (local_aa0 !=
            (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
             *)0x0) {
          uVar41 = *(undefined8 *)local_aa0;
        }
                    /* try { // try from 00401de0 to 00401de3 has its CatchHandler @ 00405a90 */
        rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                    ::__rcutils_logging_location,0x14,uVar41,"is_clockwise_oriented: %d",
                    extraout_w0 == -1);
        if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
          std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
        }
        if (local_408[0] != auStack_3f8) {
          ::operator_delete(local_408[0]);
        }
      }
      if (extraout_w0 == -1) {
LAB_003ffce8:
        paVar63 = *(allocator **)(local_e10 + (long)*local_f70 * 0x18 + 8);
        paVar42 = *(allocator **)(local_e10 + (long)*local_f70 * 0x18);
        paVar13 = paVar42;
        while (paVar12 = paVar42, paVar12 != paVar63) {
          if ((iVar6 + -4 < *(int *)paVar12 || *(int *)paVar12 < 3) ||
             (iVar5 + -4 < *(int *)(paVar12 + 4) || *(int *)(paVar12 + 4) < 3)) {
            if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
               (rcutils_logging_initialize(), (int)paVar12 != 0)) {
              fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:277] error initializing logging: "
                     ,1,0x65,*(FILE **)PTR_stderr_004deec0);
              rcutils_get_error_string(local_808);
              rcutils_get_error_string((string *)local_408);
              sVar58 = strlen((char *)local_408);
              fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
              paVar63 = (allocator *)0x1;
              fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
              rcutils_reset_error();
            }
                    /* try { // try from 003ffd64 to 003ffd67 has its CatchHandler @ 0040586c */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ffd70 to 003ffd73 has its CatchHandler @ 00405638 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 003ffd84 to 003ffd87 has its CatchHandler @ 00405634 */
            uVar35 = rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
            uVar34 = uVar35 & 0xff;
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
            if ((uVar35 & 0xff) == 0) goto LAB_003ffdb4;
                    /* try { // try from 00401e5c to 00401e5f has its CatchHandler @ 0040586c */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401e68 to 00401e6b has its CatchHandler @ 00404c24 */
            rclcpp::get_logger((string *)local_408);
            paVar63 = (allocator *)0x0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              paVar63 = *(allocator **)local_aa0;
            }
                    /* try { // try from 00401e98 to 00401e9b has its CatchHandler @ 00404c20 */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x1e,paVar63,
                        "Remove cnt index: %d, because of close to edge",*local_f70);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
            uVar34 = 0;
            cVar31 = *PTR_g_rcutils_logging_initialized_004ddfe0;
            goto joined_r0x00401ecc;
          }
          paVar13 = paVar12;
          paVar42 = paVar12 + 8;
        }
        uVar35 = (uint)paVar13;
        uVar34 = 1;
LAB_003ffdb4:
        cVar31 = *PTR_g_rcutils_logging_initialized_004ddfe0;
joined_r0x00401ecc:
                    /* try { // try from 00401ed0 to 00401f67 has its CatchHandler @ 0040586c */
        if ((cVar31 == '\0') && (rcutils_logging_initialize(), uVar35 != 0)) {
          fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:283] error initializing logging: "
                 ,1,0x65,*(FILE **)PTR_stderr_004deec0);
          rcutils_get_error_string(local_808);
          rcutils_get_error_string((string *)local_408);
          sVar58 = strlen((char *)local_408);
          fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
          paVar63 = (allocator *)0x1;
          fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
          rcutils_reset_error();
        }
                    /* try { // try from 003ffdd0 to 003ffdd3 has its CatchHandler @ 0040586c */
        std::__cxx11::string::string<std::allocator<char>>
                  ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ffddc to 003ffddf has its CatchHandler @ 0040562c */
        rclcpp::get_logger((string *)local_408);
        uVar41 = 0;
        if (local_aa0 !=
            (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
             *)0x0) {
          uVar41 = *(undefined8 *)local_aa0;
        }
                    /* try { // try from 003ffdf0 to 003ffdf3 has its CatchHandler @ 00405628 */
        uVar35 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
        if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
          std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
        }
        if (local_408[0] != auStack_3f8) {
          ::operator_delete(local_408[0]);
        }
        if ((uVar35 & 0xff) != 0) {
                    /* try { // try from 003fffd4 to 003fffd7 has its CatchHandler @ 0040586c */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003fffe0 to 003fffe3 has its CatchHandler @ 00405614 */
          rclcpp::get_logger((string *)local_408);
          paVar63 = (allocator *)0x0;
          if (local_b10 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            paVar63 = *(allocator **)local_b10;
          }
          iVar36 = *local_f70;
          local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                       *)CONCAT44(local_aa0._4_4_,0x8103000c);
          p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                         *)0x0;
          local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)
                      (local_e10 + (long)iVar36 * 0x18);
                    /* try { // try from 00400020 to 00400047 has its CatchHandler @ 00405a58 */
          cv::contourArea((_InputArray *)&local_aa0,false);
          rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                      ::__rcutils_logging_location,0x14,paVar63,&DAT_0046a7c8,iVar36);
          if (pvStack_b08 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                      ((_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)pvStack_b08);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
        }
        if (uVar34 == 0) {
                    /* try { // try from 0040341c to 00403517 has its CatchHandler @ 0040586c */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), uVar35 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:287] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
                    /* try { // try from 003ffe40 to 003ffe43 has its CatchHandler @ 0040586c */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ffe4c to 003ffe4f has its CatchHandler @ 00405620 */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 003ffe60 to 003ffe63 has its CatchHandler @ 0040561c */
          pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (((ulong)pvVar40 & 0xff) != 0) {
                    /* try { // try from 00401e14 to 00401e17 has its CatchHandler @ 0040586c */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401e20 to 00401e23 has its CatchHandler @ 004053b0 */
            rclcpp::get_logger((string *)local_408);
            paVar63 = (allocator *)0x0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              paVar63 = *(allocator **)local_aa0;
            }
                    /* try { // try from 00401e48 to 00401e4b has its CatchHandler @ 00404e68 */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x1e,paVar63,"No valid contour!!!");
            goto LAB_00401d74;
          }
        }
        else {
          local_d90 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                       *)0x0;
          local_d88 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                       *)0x0;
          local_d80 = 0;
                    /* try { // try from 00400098 to 00400143 has its CatchHandler @ 00404be4 */
          std::
          vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
          ::emplace_back<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>&>
                    ((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)&local_d90,(vector *)(local_e10 + (long)*local_f70 * 0x18));
          uVar59 = 0;
          pvVar44 = local_df0;
          pvVar88 = pvStack_de8;
          if (pvStack_de8 != local_df0) {
            do {
              while (*(int *)((long)pvVar44 + uVar59 * 0x10 + 0xc) == *local_f70) {
                pvVar78 = (vector *)(local_e10 + uVar59 * 0x18);
                for (piVar80 = *(int **)(local_e10 + uVar59 * 0x18);
                    piVar80 != *(int **)(pvVar78 + 8); piVar80 = piVar80 + 2) {
                  if ((iVar6 + -4 < *piVar80 || *piVar80 < 3) ||
                     (iVar5 + -4 < piVar80[1] || piVar80[1] < 3)) goto LAB_004000b8;
                }
                std::
                vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                ::emplace_back<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>&>
                          ((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                            *)&local_d90,pvVar78);
                uVar59 = (ulong)((int)uVar59 + 1);
                pvVar44 = local_df0;
                pvVar88 = pvStack_de8;
                if ((ulong)((long)pvStack_de8 - (long)local_df0 >> 4) <= uVar59) goto LAB_00400168;
              }
LAB_004000b8:
              uVar59 = (ulong)((int)uVar59 + 1);
            } while (uVar59 < (ulong)((long)pvVar88 - (long)pvVar44 >> 4));
          }
LAB_00400168:
          pvVar56 = local_d88;
          local_d60 = 0;
          pvStack_d68 = (vector *)0x0;
          local_d70 = (vector *)0x0;
          pvVar40 = local_d90;
          while (pvVar40 != pvVar56) {
            while( true ) {
              pMStack_b78 = (Mat *)0x0;
              local_b80 = (Mat *)0x0;
              local_b70 = 0;
              local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)CONCAT44(local_b10._4_4_,0x8103000c);
              local_b00 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              local_aa0._0_4_ = 0x8203000c;
              p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                             *)0x0;
              pvStack_b08 = pvVar40;
              local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)&local_b80;
                    /* try { // try from 004001d8 to 004001fb has its CatchHandler @ 00404bcc */
              cv::approxPolyDP((_InputArray *)&local_b10,(_OutputArray *)&local_aa0,dVar23,true);
              std::
              vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
              ::emplace_back<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>&>
                        ((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                          *)&local_d70,(vector *)&local_b80);
              local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)((ulong)local_aa0._4_4_ << 0x20);
              removeSelfIntersection(pvStack_d68 + -0x18,(int *)&local_aa0);
              pvVar40 = pvVar40 + 0x18;
              if (local_b80 == (Mat *)0x0) break;
              ::operator_delete(local_b80);
              if (pvVar56 == pvVar40) goto LAB_00400214;
            }
          }
LAB_00400214:
          clock();
                    /* try { // try from 0040021c to 0040021f has its CatchHandler @ 00404bc4 */
          __s = ::operator_new(0x2d0);
          memset(__s,0,0x2d0);
                    /* try { // try from 0040023c to 0040023f has its CatchHandler @ 00404f34 */
          std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::vector
                    ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)&local_c78,local_d70
                    );
                    /* try { // try from 00400248 to 00400393 has its CatchHandler @ 00405210 */
          std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::
          emplace_back<cv::Point_<int>&>
                    ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)&local_c78,local_c78
                    );
          uVar59 = 1;
          if (0xf < (ulong)(local_c70 - (long)local_c78)) {
            do {
              lVar93 = uVar59 * 8;
              lVar77 = (ulong)((int)uVar59 - 1) * 8;
              pPVar64 = local_c78 + lVar93;
              pPVar73 = local_c78 + lVar77;
              iVar36 = *(int *)(pPVar64 + 4);
              iVar7 = *(int *)(pPVar73 + 4);
              dVar98 = (double)(iVar36 - iVar7) * (double)(iVar36 - iVar7) +
                       (double)(*(int *)(local_c78 + lVar93) - *(int *)(local_c78 + lVar77)) *
                       (double)(*(int *)(local_c78 + lVar93) - *(int *)(local_c78 + lVar77));
              if (dVar98 < 0.0) {
                sqrt(dVar98);
                pPVar73 = local_c78 + lVar77;
                pPVar64 = local_c78 + lVar93;
                iVar7 = *(int *)(pPVar73 + 4);
                iVar36 = *(int *)(pPVar64 + 4);
              }
              uVar59 = (ulong)((int)uVar59 + 1);
              dVar100 = atan2((double)(iVar7 - iVar36),(double)(*(int *)pPVar64 - *(int *)pPVar73));
              iVar36 = ((int)((dVar100 / dVar97) * 180.0) + 0xb4) % 0xb4;
              __s[iVar36] = __s[iVar36] + (int)SQRT(dVar98);
            } while (uVar59 < (ulong)(local_c70 - (long)local_c78 >> 3));
          }
          uVar34 = *__s;
          puVar30 = __s + 1;
          puVar71 = __s;
          do {
            puVar43 = puVar30;
            uVar35 = *puVar43;
            paVar63 = (allocator *)(ulong)uVar35;
            if ((int)uVar34 < (int)uVar35) {
              puVar71 = puVar43;
              uVar34 = uVar35;
            }
            puVar30 = puVar43 + 1;
          } while (__s + 0xb4 != puVar43 + 1);
                    /* try { // try from 00403d8c to 00403e07 has its CatchHandler @ 00405210 */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), (int)puVar43 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:339] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 0040039c to 0040039f has its CatchHandler @ 00405218 */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 004003b0 to 004003b3 has its CatchHandler @ 004051dc */
          cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (cVar31 != '\0') {
                    /* try { // try from 004003ec to 004003ef has its CatchHandler @ 00405210 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004003f8 to 004003fb has its CatchHandler @ 004051d4 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00400424 to 00400427 has its CatchHandler @ 004051a8 */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,uVar41,
                        "main deg after contour line analysis:  %d",
                        (long)puVar71 - (long)__s >> 2 & 0xffffffff);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
          }
                    /* try { // try from 00400450 to 00400453 has its CatchHandler @ 00405210 */
          std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>::vector
                    ((vector<cv::Point_<int>,std::allocator<cv::Point_<int>>> *)&local_c60,local_d70
                    );
          pvVar78 = local_d70 + 0x18;
          if ((pvVar78 != pvStack_d68) &&
             (lVar77 = ((long)pvStack_d68 - (long)pvVar78 >> 3) * -0x5555555555555555,
             0 < (long)pvStack_d68 - (long)pvVar78)) {
            do {
              lVar52 = *(long *)(pvVar78 + 8);
              lVar93 = *(long *)pvVar78;
              *(long *)(pvVar78 + 8) = 0;
              *(long *)pvVar78 = 0;
              pvVar44 = *(void **)(pvVar78 + -0x18);
              *(long *)(pvVar78 + -0x10) = lVar52;
              *(long *)(pvVar78 + -0x18) = lVar93;
              *(long *)(pvVar78 + -8) = *(long *)(pvVar78 + 0x10);
              *(long *)(pvVar78 + 0x10) = 0;
              if (pvVar44 != (void *)0x0) {
                ::operator_delete(pvVar44);
              }
              pvVar78 = pvVar78 + 0x18;
              lVar77 = lVar77 + -1;
            } while (lVar77 != 0);
          }
          pvVar90 = pvStack_d68 + -0x18;
          pvVar78 = pvStack_d68 + -0x18;
          pvStack_d68 = pvVar90;
          if (*(void **)pvVar78 != (void *)0x0) {
            ::operator_delete(*(void **)pvVar78);
          }
          local_d50 = (undefined8 *)0x0;
          puStack_d48 = (undefined8 *)0x0;
          uVar79 = (long)pvStack_d68 - (long)local_d70;
          local_d40 = 0;
          puVar104 = (undefined8 *)0x0;
          uVar59 = ((long)uVar79 >> 3) * -0x5555555555555555;
          if (uVar59 != 0) {
            if (0x555555555555555 < uVar59) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 004048b0 to 004048b3 has its CatchHandler @ 00404c84 */
              std::__throw_bad_alloc();
            }
                    /* try { // try from 00400518 to 0040051b has its CatchHandler @ 00404c84 */
            puVar104 = ::operator_new(uVar79);
          }
          pvVar90 = pvStack_d68;
          local_d40 = (long)puVar104 + uVar79;
          local_d50 = puVar104;
          puStack_d48 = puVar104;
          piVar80 = local_c58;
          for (pvVar78 = local_d70; local_c58 = piVar80, pvVar78 != pvVar90;
              pvVar78 = pvVar78 + 0x18) {
            lVar77 = *(long *)pvVar78;
            lVar93 = *(long *)(pvVar78 + 8);
            *puVar104 = 0;
            puVar104[1] = 0;
            puVar104[2] = 0;
            uVar59 = lVar93 - lVar77;
            if ((long)uVar59 >> 3 == 0) {
              puVar45 = (undefined8 *)0x0;
            }
            else {
              if (0xfffffffffffffff < (ulong)((long)uVar59 >> 3)) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 00404884 to 00404887 has its CatchHandler @ 00404cb4 */
                std::__throw_bad_alloc();
              }
                    /* try { // try from 00400578 to 0040057b has its CatchHandler @ 00404cb4 */
              puVar45 = ::operator_new(uVar59);
            }
            puVar104[2] = (long)puVar45 + uVar59;
            puVar104[1] = puVar45;
            *puVar104 = puVar45;
            puVar61 = *(undefined8 **)pvVar78;
            puVar8 = *(undefined8 **)(pvVar78 + 8);
            if (puVar61 != puVar8) {
              uVar79 = (long)puVar8 + (-8 - (long)puVar61);
              uVar59 = uVar79 >> 3;
              puVar68 = puVar45;
              if ((uVar59 & 0x1ffffffffffffffc) == 0 ||
                  (ulong)((long)puVar61 + (0xf - (long)puVar45)) < 0x1f) {
                do {
                  puVar62 = puVar61 + 1;
                  *puVar68 = *puVar61;
                  puVar61 = puVar62;
                  puVar68 = puVar68 + 1;
                } while (puVar8 != puVar62);
              }
              else {
                uVar59 = uVar59 + 1;
                lVar77 = 0;
                do {
                  uVar41 = *(undefined8 *)((long)puVar61 + lVar77);
                  ((undefined8 *)((long)puVar45 + lVar77))[1] =
                       ((undefined8 *)((long)puVar61 + lVar77))[1];
                  *(undefined8 *)((long)puVar45 + lVar77) = uVar41;
                  lVar77 = lVar77 + 0x10;
                } while (lVar77 != (uVar59 >> 1) * 0x10);
                if ((uVar59 & 1) != 0) {
                  puVar45[uVar59 & 0xfffffffffffffffe] = puVar61[uVar59 & 0xfffffffffffffffe];
                }
              }
              puVar45 = (undefined8 *)((long)puVar45 + uVar79 + 8);
            }
            puVar104[1] = puVar45;
            puVar104 = puVar104 + 3;
            piVar80 = local_c58;
          }
          local_bf0 = 0;
          local_be8 = 0;
          local_be0 = 0;
          puStack_d48 = puVar104;
          for (piVar91 = local_c60; piVar91 != piVar80; piVar91 = piVar91 + 2) {
                    /* try { // try from 00400644 to 00400647 has its CatchHandler @ 00404cc8 */
            CGAL::Point_2<CGAL::Epeck>::Point_2<int,int>
                      ((Point_2<CGAL::Epeck> *)&local_aa0,piVar91,piVar91 + 1);
                    /* try { // try from 00400654 to 00400657 has its CatchHandler @ 004051e0 */
            std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
            insert((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                   &local_bf0,local_be8,(_InputArray *)&local_aa0);
            if ((local_aa0 !=
                 (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                  *)0x0) &&
               (iVar36 = *(int *)(local_aa0 + 8), *(int *)(local_aa0 + 8) = iVar36 + -1,
               iVar36 + -1 == 0)) {
              (**(code **)(*(long *)local_aa0 + 8))();
            }
          }
          iVar36 = (int)((long)puStack_d48 - (long)local_d50 >> 3) * -0x55555555;
          lVar77 = (long)iVar36;
          if (0x3ffffffffffffff < (ulong)(long)iVar36) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 00404890 to 00404893 has its CatchHandler @ 00404cc8 */
            std::__throw_length_error("cannot create std::vector larger than max_size()");
          }
          local_d20 = (undefined8 *)0x0;
          local_d30 = (undefined8 *)0x0;
          local_d28 = (undefined8 *)0x0;
          if (lVar77 != 0) {
                    /* try { // try from 004006cc to 004006cf has its CatchHandler @ 00404cc8 */
            local_d30 = ::operator_new(lVar77 * 0x20);
            local_d20 = local_d30 + lVar77 * 4;
            puVar104 = local_d30;
            do {
              puVar104[2] = 0;
              puVar45 = puVar104 + 4;
              puVar104[1] = 0;
              *puVar104 = 0;
              puVar104 = puVar45;
            } while (local_d20 != puVar45);
          }
          local_d28 = local_d20;
          if (local_d50 != puStack_d48) {
            uVar59 = 0;
            puVar57 = PTR_vtable_004de450 + 0x10;
            do {
              piVar80 = (int *)local_d50[uVar59 * 3];
              local_b00 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              pvStack_b08 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)0x0;
              p_Var70 = (_InputArray *)(local_d50 + uVar59 * 3);
              piVar91 = *(int **)(p_Var70 + 8);
              for (; piVar80 != piVar91; piVar80 = piVar80 + 2) {
                uVar41 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 00400768 to 0040076b has its CatchHandler @ 00405078 */
                local_aa0 = ::operator_new(0x40);
                iVar36 = *piVar80;
                iVar7 = piVar80[1];
                *(undefined **)local_aa0 = puVar57;
                dVar100 = (double)iVar36;
                dVar98 = (double)iVar7;
                *(undefined4 *)(local_aa0 + 8) = 1;
                *(undefined8 *)(local_aa0 + 0x30) = 0;
                *(int *)(local_aa0 + 0x38) = iVar7;
                *(int *)(local_aa0 + 0x3c) = iVar36;
                *(double *)(local_aa0 + 0x28) = dVar98;
                *(double *)(local_aa0 + 0x10) = -dVar100;
                *(double *)(local_aa0 + 0x18) = dVar100;
                *(double *)(local_aa0 + 0x20) = -dVar98;
                fpcr = uVar41;
                p_Var70 = (_InputArray *)&local_aa0;
                    /* try { // try from 004007b4 to 004007b7 has its CatchHandler @ 00405014 */
                std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                insert((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                        *)&local_b10,pvStack_b08);
                if ((local_aa0 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = *(int *)(local_aa0 + 8), *(int *)(local_aa0 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_aa0 + 8))();
                }
              }
                    /* try { // try from 004007f0 to 0040081b has its CatchHandler @ 0040500c */
              uVar34 = DoEdgesIntersect((Polygon_2 *)&local_bf0,(Polygon_2 *)&local_b10);
              pvVar56 = pvStack_b08;
              pvVar40 = local_b10;
              if ((uVar34 & 0xff) == 0) {
                for (; pvVar40 != pvVar56; pvVar40 = pvVar40 + 8) {
                    /* try { // try from 00402090 to 00402093 has its CatchHandler @ 0040500c */
                  std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  ::insert((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                            *)(local_d30 + uVar59 * 4),
                           *(undefined8 *)
                            ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              *)(local_d30 + uVar59 * 4) + 8),pvVar40);
                }
              }
              else {
                    /* try { // try from 00403390 to 0040340b has its CatchHandler @ 0040500c */
                if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
                   (rcutils_logging_initialize(), uVar34 != 0)) {
                  fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:363] error initializing logging: "
                         ,1,0x65,*(FILE **)PTR_stderr_004deec0);
                  rcutils_get_error_string(local_808);
                  rcutils_get_error_string((string *)local_408);
                  sVar58 = strlen((char *)local_408);
                  fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
                  p_Var70 = (_InputArray *)0x1;
                  fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
                  rcutils_reset_error();
                }
                std::__cxx11::string::string<std::allocator<char>>
                          ((string *)local_408,"coverage_planner_server",(allocator *)p_Var70);
                    /* try { // try from 00400824 to 00400827 has its CatchHandler @ 00404d84 */
                rclcpp::get_logger((string *)local_408);
                uVar41 = 0;
                if (local_aa0 !=
                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)0x0) {
                  uVar41 = *(undefined8 *)local_aa0;
                }
                    /* try { // try from 00400838 to 0040083b has its CatchHandler @ 00404d80 */
                cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
                }
                if (local_408[0] != auStack_3f8) {
                  ::operator_delete(local_408[0]);
                }
                if (cVar31 != '\0') {
                    /* try { // try from 00400874 to 00400877 has its CatchHandler @ 0040500c */
                  std::__cxx11::string::string<std::allocator<char>>
                            ((string *)local_408,"coverage_planner_server",(allocator *)p_Var70);
                    /* try { // try from 00400880 to 00400883 has its CatchHandler @ 00404d78 */
                  rclcpp::get_logger((string *)local_408);
                  uVar41 = 0;
                  if (local_aa0 !=
                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                       *)0x0) {
                    uVar41 = *(undefined8 *)local_aa0;
                  }
                    /* try { // try from 004008a8 to 004008ab has its CatchHandler @ 00404d3c */
                  rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                              ::__rcutils_logging_location,0x1e,uVar41,
                              "!!!!!!!!!!!!!!! Outer poly intersection with inner poly!!!");
                  if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
                  }
                  if (local_408[0] != auStack_3f8) {
                    ::operator_delete(local_408[0]);
                  }
                }
                    /* try { // try from 004008d0 to 004008d3 has its CatchHandler @ 0040500c */
                pLVar46 = ::operator_new(0x30);
                pvVar56 = pvStack_b08;
                pvVar40 = local_b10;
                uVar21 = _UNK_0046c8c8;
                uVar41 = _DAT_0046c8c0;
                local_b70 = 0;
                local_b80 = (Mat *)0x0;
                pMStack_b78 = (Mat *)0x0;
                *(undefined **)pLVar46 = PTR_vtable_004de288 + 0x10;
                *(undefined4 *)(pLVar46 + 8) = 1;
                *(undefined8 *)(pLVar46 + 0x20) = 0;
                *(undefined8 *)(pLVar46 + 0x18) = uVar21;
                *(undefined8 *)(pLVar46 + 0x10) = uVar41;
                *(undefined8 *)(pLVar46 + 0x28) = uVar38;
                local_c48 = pLVar46;
                    /* try { // try from 00400924 to 00400947 has its CatchHandler @ 00404f2c */
                uVar41 = CGAL::
                         Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                         ::To_double::operator()((To_double *)&local_c48,pLVar46);
                CGAL::
                Straight_skeleton_builder_2<CGAL::Straight_skeleton_builder_traits_2<CGAL::Epick>,CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>,CGAL::Dummy_straight_skeleton_builder_2_visitor<CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>>>
                ::Straight_skeleton_builder_2
                          ((_InputArray *)&local_aa0,1,uVar41,&local_bd0,&local_c90);
                    /* try { // try from 0040095c to 0040096f has its CatchHandler @ 00404f3c */
                CGAL::
                Straight_skeleton_builder_2<CGAL::Straight_skeleton_builder_traits_2<CGAL::Epick>,CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>,CGAL::Dummy_straight_skeleton_builder_2_visitor<CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>>>
                ::
                enter_contour<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,CGAL::Cartesian_converter<CGAL::Epeck,CGAL::Epick,CGAL::NT_converter<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,double>>>
                          ((Straight_skeleton_builder_2<CGAL::Straight_skeleton_builder_traits_2<CGAL::Epick>,CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>,CGAL::Dummy_straight_skeleton_builder_2_visitor<CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>>>
                            *)pLVar46,pvVar40,pvVar56,&local_c90,1);
                CGAL::
                Straight_skeleton_builder_2<CGAL::Straight_skeleton_builder_traits_2<CGAL::Epick>,CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>,CGAL::Dummy_straight_skeleton_builder_2_visitor<CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>>>
                ::construct_skeleton(SUB81((_InputArray *)&local_aa0,0));
                plVar48 = local_9d0;
                plVar47 = local_9c8;
                plVar49 = local_9c8;
                if (local_9a8 != (sp_counted_base *)0x0) {
                  boost::detail::sp_counted_base::release(local_9a8);
                  plVar48 = local_9d0;
                  plVar47 = local_9c8;
                  plVar49 = local_9c8;
                }
                for (; plVar65 = local_9c8, plVar48 != local_9c8; plVar48 = plVar48 + 1) {
                  plVar47 = (long *)*plVar48;
                  local_9c8 = plVar49;
                  if ((plVar47 != (long *)0x0) &&
                     (lVar77 = plVar47[1], plVar47[1] = lVar77 + -1, lVar77 + -1 == 0)) {
                    (**(code **)(*plVar47 + 8))();
                  }
                  plVar47 = local_9d0;
                  plVar49 = local_9c8;
                  local_9c8 = plVar65;
                }
                local_9c8 = plVar49;
                if (plVar47 != (long *)0x0) {
                  ::operator_delete(plVar47);
                }
                if (local_a18 != (void *)0x0) {
                  ::operator_delete(local_a18);
                }
                pppppppvVar9 = local_a30[0];
                while (pppppppvVar9 != local_a30) {
                  pppppppvVar84 = *pppppppvVar9;
                  ::operator_delete(pppppppvVar9);
                  pppppppvVar9 = pppppppvVar84;
                }
                if (local_a48 != (void *)0x0) {
                  ::operator_delete(local_a48);
                }
                if (local_a60 != (void *)0x0) {
                  ::operator_delete(local_a60);
                }
                p_Var1 = p_Stack_a90;
                p_Var14 = local_a88;
                p_Var15 = local_a88;
                if (local_a78 != (void *)0x0) {
                  ::operator_delete(local_a78);
                  p_Var1 = p_Stack_a90;
                  p_Var14 = local_a88;
                  p_Var15 = local_a88;
                }
                for (; p_Var29 = local_a88, p_Var1 != local_a88; p_Var1 = p_Var1 + 8) {
                  plVar48 = *(long **)p_Var1;
                  local_a88 = p_Var15;
                  if ((plVar48 != (long *)0x0) &&
                     (lVar77 = plVar48[1], plVar48[1] = lVar77 + -1, lVar77 + -1 == 0)) {
                    (**(code **)(*plVar48 + 8))();
                  }
                  p_Var14 = p_Stack_a90;
                  p_Var15 = local_a88;
                  local_a88 = p_Var29;
                }
                local_a88 = p_Var15;
                if (p_Var14 !=
                    (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                     *)0x0) {
                  ::operator_delete(p_Var14);
                }
                    /* try { // try from 00400a8c to 00400a8f has its CatchHandler @ 00404f04 */
                CGAL::CGAL_SS_i::
                create_offset_polygons_2<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::Straight_skeleton_2<CGAL::Epick,CGAL::Straight_skeleton_items_2,std::allocator<int>>,CGAL::Epeck>
                          ((_InputArray *)&local_aa0,(To_double *)&local_c48,local_bd0,&local_c90,0)
                ;
                pMVar96 = local_b80;
                pMVar81 = pMStack_b78;
                pMVar16 = pMStack_b78;
                if (local_bc8 != (sp_counted_base *)0x0) {
                  boost::detail::sp_counted_base::release(local_bc8);
                  pMVar96 = local_b80;
                  pMVar81 = pMStack_b78;
                  pMVar16 = pMStack_b78;
                }
                for (; pMVar27 = pMStack_b78, bVar33 = pMVar96 != pMStack_b78, pMStack_b78 = pMVar16
                    , bVar33; pMVar96 = pMVar96 + 0x20) {
                  while( true ) {
                    plVar48 = *(long **)pMVar96;
                    plVar47 = *(long **)(pMVar96 + 8);
                    if (plVar48 != plVar47) {
                      do {
                        plVar49 = (long *)*plVar48;
                        if ((plVar49 != (long *)0x0) &&
                           (iVar36 = (int)plVar49[1] + -1, *(int *)(plVar49 + 1) = iVar36,
                           iVar36 == 0)) {
                          (**(code **)(*plVar49 + 8))();
                        }
                        plVar48 = plVar48 + 1;
                      } while (plVar47 != plVar48);
                      plVar47 = *(long **)pMVar96;
                    }
                    if (plVar47 == (long *)0x0) break;
                    pMVar96 = pMVar96 + 0x20;
                    ::operator_delete(plVar47);
                    pMVar81 = local_b80;
                    if (pMVar27 == pMVar96) goto LAB_00400b10;
                  }
                  pMVar81 = local_b80;
                  pMVar16 = pMStack_b78;
                  pMStack_b78 = pMVar27;
                }
LAB_00400b10:
                if (pMVar81 != (Mat *)0x0) {
                  ::operator_delete(pMVar81);
                }
                pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)local_a98;
                if (local_aa0 !=
                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)local_a98) {
                  lVar77 = **(long **)local_aa0;
                  lVar93 = (*(long **)local_aa0)[1];
                  pvVar56 = local_aa0;
                  pvVar10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)local_a98;
                  pcVar11 = (code *)PTR_destroy_004de358;
                  if (lVar77 != lVar93) {
                    do {
                    /* try { // try from 00400b50 to 00400b53 has its CatchHandler @ 00404ec8 */
                      std::
                      vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                      ::insert((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                                *)(local_d30 + uVar59 * 4),
                               *(undefined8 *)
                                ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                                  *)(local_d30 + uVar59 * 4) + 8),lVar77);
                      lVar77 = lVar77 + 8;
                    } while (lVar93 != lVar77);
                    pvVar56 = local_aa0;
                    pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                               *)local_a98;
                    pvVar10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                               *)local_a98;
                    pcVar11 = (code *)PTR_destroy_004de358;
                    if (local_aa0 ==
                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)local_a98) goto LAB_00400c04;
                  }
                  do {
                    while (plVar48 = *(long **)(pvVar56 + 8), plVar48 == (long *)0x0) {
LAB_00400b7c:
                      pvVar56 = pvVar56 + 0x10;
                      pvVar40 = local_aa0;
                      if (pvVar56 == pvVar10) goto LAB_00400c04;
                    }
                    plVar47 = plVar48 + 1;
                    do {
                      lVar77 = *plVar47;
                      cVar31 = '\x01';
                      bVar33 = (bool)ExclusiveMonitorPass(plVar47,0x10);
                      if (bVar33) {
                        *(int *)plVar47 = (int)lVar77 + -1;
                        cVar31 = ExclusiveMonitorsStatus();
                      }
                    } while (cVar31 != '\0');
                    if ((int)lVar77 != 1) goto LAB_00400b7c;
                    (**(code **)(*plVar48 + 0x10))(plVar48);
                    piVar80 = (int *)((long)plVar48 + 0xc);
                    do {
                      iVar36 = *piVar80;
                      cVar31 = '\x01';
                      bVar33 = (bool)ExclusiveMonitorPass(piVar80,0x10);
                      if (bVar33) {
                        *piVar80 = iVar36 + -1;
                        cVar31 = ExclusiveMonitorsStatus();
                      }
                    } while (cVar31 != '\0');
                    if (iVar36 != 1) goto LAB_00400b7c;
                    pcVar60 = *(code **)(*plVar48 + 0x18);
                    if (pcVar60 != pcVar11) {
                      (*pcVar60)(plVar48);
                      goto LAB_00400b7c;
                    }
                    pvVar56 = pvVar56 + 0x10;
                    (**(code **)(*plVar48 + 8))(plVar48);
                    pvVar40 = local_aa0;
                  } while (pvVar56 != pvVar10);
                }
LAB_00400c04:
                if (pvVar40 !=
                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)0x0) {
                  ::operator_delete(pvVar40);
                }
                if ((local_c48 != (Lazy_exact_nt *)0x0) &&
                   (iVar36 = *(int *)(local_c48 + 8), *(int *)(local_c48 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_c48 + 8))();
                }
              }
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_b10);
              uVar59 = (ulong)((int)uVar59 + 1);
              uVar79 = ((long)puStack_d48 - (long)local_d50 >> 3) * -0x5555555555555555;
            } while (uVar59 <= uVar79 && uVar79 - uVar59 != 0);
          }
          puVar45 = local_d28;
          puVar104 = local_d30;
                    /* try { // try from 00400c7c to 00400c7f has its CatchHandler @ 00405550 */
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::vector
                    ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                      *)&local_b80,(vector *)&local_bf0);
          local_b60 = 0;
          local_b58 = 0;
          uStack_b48 = 0;
          local_b50 = 0;
          uStack_b38 = 0;
          local_b40 = 0;
          uStack_b28 = 0;
          local_b30 = 0;
          uStack_b18 = 0;
          local_b20 = 0;
                    /* try { // try from 00400cac to 00400caf has its CatchHandler @ 00405518 */
          std::
          deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
          ::
          _M_range_initialize<__gnu_cxx::__normal_iterator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>*,std::vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>>>
                    (&local_b60,puVar104,puVar45,0);
          lVar77 = tpidr_el0;
          cVar39 = clock();
          lVar93 = (*(code *)PTR_004e2f90)(&PTR_004e2f90);
          local_d00 = 0;
          local_d10 = (Polygon_2 *)0x0;
          local_d08 = (Polygon_2 *)0x0;
          if ((*(ulong *)(lVar77 + lVar93) & 1) == 0) {
                    /* try { // try from 00403728 to 0040372b has its CatchHandler @ 00405564 */
            plVar48 = ::operator_new(0x38);
            ppuVar74 = &PTR_EscapePrecFlag_004de000;
            lVar93 = lVar77;
            lVar52 = (*(code *)PTR_004e32a0)(&PTR_004e32a0);
            ppuVar75 = &PTR_EscapePrecFlag_004de000;
            *(long **)(lVar93 + lVar52) = plVar48;
            auVar105 = (*(code *)PTR_004e2f90)(&PTR_004e2f90,lVar93 + lVar52);
            *(undefined4 *)(plVar48 + 1) = 1;
            puVar55 = ppuVar74[0x50];
            *(undefined8 *)(lVar93 + auVar105._0_8_) = 1;
            puVar57 = ppuVar75[0x140];
            *plVar48 = (long)(puVar55 + 0x10);
            plVar48[6] = 0;
            __cxa_thread_atexit(puVar57,auVar105._8_8_,&__dso_handle);
          }
          lVar93 = (*(code *)PTR_004e32a0)(&PTR_004e32a0);
          paVar63 = (allocator *)(ulong)param_6;
          local_e40 = *(long **)(lVar77 + lVar93);
          *(int *)(local_e40 + 1) = (int)local_e40[1] + 1;
                    /* try { // try from 00400d2c to 00400d43 has its CatchHandler @ 004052b4 */
          polygon_coverage_planning::computeBestBCDFromPolygonWithHoles
                    ((Polygon_with_holes_2 *)&local_b80,param_5,param_6,(vector *)&local_d10,
                     (Direction_2 *)&local_e40);
          calculateDecompositionAdjacency((vector *)&local_d10);
          cVar50 = clock();
                    /* try { // try from 00403e0c to 00403e87 has its CatchHandler @ 004056c8 */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), (int)cVar50 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:444] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
                    /* try { // try from 00400d68 to 00400d6b has its CatchHandler @ 004056c8 */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400d74 to 00400d77 has its CatchHandler @ 0040575c */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 00400d88 to 00400d8b has its CatchHandler @ 00405648 */
          cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (cVar31 != '\0') {
                    /* try { // try from 00400dc4 to 00400dc7 has its CatchHandler @ 004056c8 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400dd0 to 00400dd3 has its CatchHandler @ 00405640 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00400e10 to 00400e13 has its CatchHandler @ 00404db0 */
            rcutils_log((double)(cVar50 - cVar39) / 1000000.0,
                        getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,uVar41,
                        "------2 - BCD compute time cost: %.2f");
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
          }
          cVar39 = clock();
          paVar63 = (allocator *)&local_e58;
                    /* try { // try from 00400e4c to 00400e4f has its CatchHandler @ 004056c8 */
          CGAL::Point_2<CGAL::Epeck>::Point_2<int,int>
                    ((Point_2<CGAL::Epeck> *)&local_e38,local_e54,(int *)paVar63);
                    /* try { // try from 00400e58 to 00400e83 has its CatchHandler @ 00404da8 */
          iVar36 = getCellIndexOfPoint((vector *)&local_d10,(Point_2 *)&local_e38);
          if (iVar36 < 0) {
            if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
               (rcutils_logging_initialize(), iVar36 != 0)) {
              fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:453] error initializing logging: "
                     ,1,0x65,*(FILE **)PTR_stderr_004deec0);
              rcutils_get_error_string(local_808);
              rcutils_get_error_string((string *)local_408);
              sVar58 = strlen((char *)local_408);
              fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
              paVar63 = (allocator *)0x1;
              fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
              rcutils_reset_error();
            }
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400e8c to 00400e8f has its CatchHandler @ 00405054 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00400ea0 to 00400ea3 has its CatchHandler @ 00405050 */
            cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
            if (cVar31 != '\0') {
                    /* try { // try from 00400edc to 00400edf has its CatchHandler @ 00404da8 */
              std::__cxx11::string::string<std::allocator<char>>
                        ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400ee8 to 00400eeb has its CatchHandler @ 0040531c */
              rclcpp::get_logger((string *)local_408);
              paVar63 = (allocator *)0x0;
              if (local_aa0 !=
                  (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)0x0) {
                paVar63 = *(allocator **)local_aa0;
              }
                    /* try { // try from 00400f14 to 00400f17 has its CatchHandler @ 00404f98 */
              rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                          ::__rcutils_logging_location,0x1e,paVar63,
                          "Point is not in any movable cell!!! \tstart_cell_index: %d",iVar36);
              if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
              }
              if (local_408[0] != auStack_3f8) {
                ::operator_delete(local_408[0]);
              }
            }
                    /* try { // try from 00400f3c to 00400f67 has its CatchHandler @ 00404da8 */
            pcVar51 = (char *)CoveragePlannerInterface::get_check_start_valid
                                        ((CoveragePlannerInterface *)this);
            if (*pcVar51 != '\0') {
              if ((local_e38 != (long *)0x0) &&
                 (iVar5 = (int)local_e38[1] + -1, *(int *)(local_e38 + 1) = iVar5, iVar5 == 0)) {
                (**(code **)(*local_e38 + 8))();
              }
              std::vector<CellNode,std::allocator<CellNode>>::~vector
                        ((vector<CellNode,std::allocator<CellNode>> *)&local_c48);
              if ((local_e40 != (long *)0x0) &&
                 (iVar5 = (int)local_e40[1] + -1, *(int *)(local_e40 + 1) = iVar5, iVar5 == 0)) {
                (**(code **)(*local_e40 + 8))();
              }
              std::
              vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::~vector((vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                         *)&local_d10);
              std::
              deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::~deque((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                        *)&local_b60);
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_b80);
              std::
              vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::~vector((vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                         *)&local_d30);
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_bf0);
              std::
              vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
              ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)&local_d50);
              if (local_c60 != (int *)0x0) {
                ::operator_delete(local_c60);
              }
              if (local_c78 != (Point_ *)0x0) {
                ::operator_delete(local_c78);
              }
              ::operator_delete(__s);
              std::
              vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
              ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)&local_d70);
              std::
              vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
              ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)&local_d90);
              if (local_db0 != (int *)0x0) {
                ::operator_delete(local_db0);
              }
              cVar31 = '\0';
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_c10);
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_c30);
              goto LAB_003fff4c;
            }
                    /* try { // try from 00404118 to 00404213 has its CatchHandler @ 00404da8 */
            if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
               (rcutils_logging_initialize(), (int)pcVar51 != 0)) {
              fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:459] error initializing logging: "
                     ,1,0x65,*(FILE **)PTR_stderr_004deec0);
              rcutils_get_error_string(local_808);
              rcutils_get_error_string((string *)local_408);
              sVar58 = strlen((char *)local_408);
              fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
              paVar63 = (allocator *)0x1;
              fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
              rcutils_reset_error();
            }
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400f70 to 00400f73 has its CatchHandler @ 00405048 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00400f84 to 00400f87 has its CatchHandler @ 00405008 */
            cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
            iVar36 = 0;
            if (cVar31 != '\0') {
                    /* try { // try from 00403b4c to 00403b4f has its CatchHandler @ 00404da8 */
              std::__cxx11::string::string<std::allocator<char>>
                        ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00403b58 to 00403b5b has its CatchHandler @ 00404fa4 */
              rclcpp::get_logger((string *)local_408);
              paVar63 = (allocator *)0x0;
              if (local_aa0 !=
                  (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)0x0) {
                paVar63 = *(allocator **)local_aa0;
              }
                    /* try { // try from 00403b80 to 00403b83 has its CatchHandler @ 00404f64 */
              rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                          ::__rcutils_logging_location,0x1e,paVar63,
                          "Point is not in any movable cell!!! Just setting start cell index to 0, may lead to inefficient behavior!!!"
                         );
              if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
              }
              if (local_408[0] != auStack_3f8) {
                ::operator_delete(local_408[0]);
              }
              iVar36 = 0;
            }
          }
                    /* try { // try from 00400fc4 to 00400fc7 has its CatchHandler @ 00404da8 */
          getTravellingPath((vector *)&local_c48,iVar36);
          cVar50 = clock();
                    /* try { // try from 00403f8c to 00404007 has its CatchHandler @ 00404d14 */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), (int)cVar50 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:467] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
                    /* try { // try from 00400fec to 00400fef has its CatchHandler @ 00404d14 */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00400ff8 to 00400ffb has its CatchHandler @ 00404d34 */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 0040100c to 0040100f has its CatchHandler @ 00404d1c */
          uVar34 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if ((uVar34 & 0xff) == 0) {
LAB_0040103c:
            cVar31 = *PTR_g_rcutils_logging_initialized_004ddfe0;
          }
          else {
                    /* try { // try from 004037a4 to 004037a7 has its CatchHandler @ 00404d14 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004037b0 to 004037b3 has its CatchHandler @ 0040555c */
            rclcpp::get_logger((string *)local_408);
            paVar63 = (allocator *)0x0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              paVar63 = *(allocator **)local_aa0;
            }
                    /* try { // try from 00403828 to 0040382b has its CatchHandler @ 00405558 */
            rcutils_log((double)(cVar50 - cVar39) / 1000000.0,
                        getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,paVar63,
                        "cell traveling path length:  %zu timecost: %.2f",
                        ((long)local_ba0 - local_b98 >> 2) +
                        ((local_b88 - (long)local_ba8 >> 3) + -1) * 0x80 +
                        ((long)local_bb0 - (long)local_bc0 >> 2));
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] == auStack_3f8) goto LAB_0040103c;
            ::operator_delete(local_408[0]);
            cVar31 = *PTR_g_rcutils_logging_initialized_004ddfe0;
          }
                    /* try { // try from 0040385c to 004038d7 has its CatchHandler @ 00404d14 */
          if ((cVar31 == '\0') && (rcutils_logging_initialize(), uVar34 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:471] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
                    /* try { // try from 00401058 to 0040105b has its CatchHandler @ 00404d14 */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401064 to 00401067 has its CatchHandler @ 00404c98 */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 00401078 to 0040107b has its CatchHandler @ 00405198 */
          uVar34 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if ((uVar34 & 0xff) != 0) {
                    /* try { // try from 004010b4 to 004010b7 has its CatchHandler @ 00404d14 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004010c0 to 004010c3 has its CatchHandler @ 0040539c */
            rclcpp::get_logger((string *)local_408);
            paVar63 = (allocator *)0x0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              paVar63 = *(allocator **)local_aa0;
            }
                    /* try { // try from 004010ec to 004010ef has its CatchHandler @ 004055d4 */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,paVar63,"start cell: %d",iVar36);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
          }
                    /* try { // try from 0040111c to 0040111f has its CatchHandler @ 00404d14 */
          std::__cxx11::stringstream::stringstream(asStack_990);
          piVar87 = local_ba0;
          puVar104 = local_ba8 + 1;
          piVar80 = local_bc0;
          piVar91 = local_bb0;
          while (piVar87 != piVar80) {
            paVar63 = (allocator *)0x4;
                    /* try { // try from 00401154 to 0040119f has its CatchHandler @ 004052d4 */
            std::__ostream_insert<char,std::char_traits<char>>(aoStack_980," -> ",4);
            std::ostream::operator<<(aoStack_980,*piVar80);
            piVar80 = piVar80 + 1;
            if (piVar91 == piVar80) {
              piVar80 = (int *)*puVar104;
              piVar91 = (int *)*puVar104 + 0x80;
              puVar104 = puVar104 + 1;
            }
          }
                    /* try { // try from 00403f0c to 00403f87 has its CatchHandler @ 004052d4 */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), uVar34 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:476] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004011a8 to 004011ab has its CatchHandler @ 0040505c */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 004011bc to 004011bf has its CatchHandler @ 004052bc */
          cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (cVar31 != '\0') {
                    /* try { // try from 00401200 to 00401203 has its CatchHandler @ 004052d4 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_808,"coverage_planner_server",paVar63);
                    /* try { // try from 0040120c to 0040120f has its CatchHandler @ 0040519c */
            rclcpp::get_logger((string *)local_808);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00401228 to 0040122b has its CatchHandler @ 00404ab4 */
            std::__cxx11::stringbuf::str();
                    /* try { // try from 0040124c to 0040124f has its CatchHandler @ 004052e8 */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,uVar41,&DAT_0046ad28,local_408[0]);
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_808[0] != auStack_7f8) {
              ::operator_delete(local_808[0]);
            }
          }
          cVar39 = clock();
                    /* try { // try from 00401294 to 00401297 has its CatchHandler @ 004052d4 */
          CoveragePlannerInterface::coverage_length((CoveragePlannerInterface *)this);
          pPVar24 = local_d08;
          local_ce0 = (vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)0x0;
          local_cf0 = (vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)0x0;
          local_ce8 = (vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)0x0;
          if (local_d08 != local_d10) {
            puVar57 = PTR_vtable_004de280 + 0x10;
            pPVar82 = local_d10;
            do {
              lVar93 = (*(code *)PTR_004e2f90)(&PTR_004e2f90);
              local_c80 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              local_c90 = (Point_2 *)0x0;
              local_c88 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              if ((*(ulong *)(lVar77 + lVar93) & 1) == 0) {
                    /* try { // try from 00402adc to 00402adf has its CatchHandler @ 00404d94 */
                plVar48 = ::operator_new(0x38);
                ppuVar74 = &PTR_EscapePrecFlag_004de000;
                lVar93 = lVar77;
                lVar52 = (*(code *)PTR_004e32a0)(&PTR_004e32a0);
                *(long **)(lVar93 + lVar52) = plVar48;
                auVar105 = (*(code *)PTR_004e2f90)(&PTR_004e2f90,lVar93 + lVar52);
                *(undefined8 *)(lVar93 + auVar105._0_8_) = 1;
                puVar55 = ppuVar74[0x140];
                *(undefined4 *)(plVar48 + 1) = 1;
                *plVar48 = (long)puVar57;
                plVar48[6] = 0;
                __cxa_thread_atexit(puVar55,auVar105._8_8_,&__dso_handle);
              }
              lVar93 = lVar77;
              lVar52 = (*(code *)PTR_004e32a0)(&PTR_004e32a0);
              local_e20[0] = *(long **)(lVar93 + lVar52);
              *(int *)(local_e20[0] + 1) = (int)local_e20[0][1] + 1;
                    /* try { // try from 00401330 to 0040134b has its CatchHandler @ 00405314 */
              polygon_coverage_planning::findBestSweepDir(pPVar82,(Direction_2 *)local_e20);
              if (param_5) {
                CGAL::
                Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                              *)&local_aa0,(Direction_2 *)&local_e40);
                uVar41 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 0040135c to 0040135f has its CatchHandler @ 00404e2c */
                local_b10 = ::operator_new(0x30);
                puVar55 = PTR_vtable_004de8f8;
                lVar93 = *(long *)(local_cd0 + 0x20);
                lVar52 = *(long *)(local_cd0 + 0x28);
                *(undefined4 *)((long)local_b10 + 8) = 1;
                *(undefined **)local_b10 = puVar55 + 0x10;
                iVar36 = *(int *)(local_cd0 + 8);
                *(long *)((long)local_b10 + 0x10) = lVar93;
                *(long *)((long)local_b10 + 0x18) = lVar52;
                *(long *)((long)local_b10 + 0x20) = 0;
                *(uint *)(local_cd0 + 8) = iVar36 + 1U;
                *(Point_2 **)((long)local_b10 + 0x28) = local_cd0;
                fpcr = uVar41;
                    /* try { // try from 004013a4 to 004013bb has its CatchHandler @ 00404ddc */
                dVar98 = (double)CGAL::
                                 Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                                 ::To_double::operator()
                                           ((To_double *)&local_b10,
                                            (Lazy_exact_nt *)(ulong)(iVar36 + 1U));
                CGAL::
                Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                ::operator()((Lazy_construction<CGAL::Epeck,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Construct_vector_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Default,true>
                              *)&local_aa0,(Direction_2 *)&local_e40);
                uVar41 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 004013cc to 004013cf has its CatchHandler @ 004056d0 */
                local_aa0 = ::operator_new(0x30);
                puVar55 = PTR_vtable_004dea28;
                lVar93 = local_cb0[2];
                lVar52 = local_cb0[3];
                *(undefined4 *)((long)local_aa0 + 8) = 1;
                *(undefined **)local_aa0 = puVar55 + 0x10;
                lVar85 = local_cb0[1];
                *(long *)((long)local_aa0 + 0x10) = lVar93;
                *(long *)((long)local_aa0 + 0x18) = lVar52;
                uVar34 = (int)lVar85 + 1;
                *(long *)((long)local_aa0 + 0x20) = 0;
                *(uint *)(local_cb0 + 1) = uVar34;
                *(long **)((long)local_aa0 + 0x28) = local_cb0;
                fpcr = uVar41;
                    /* try { // try from 00401414 to 00401417 has its CatchHandler @ 00405674 */
                dVar100 = (double)CGAL::
                                  Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                                  ::To_double::operator()
                                            ((To_double *)&local_aa0,(Lazy_exact_nt *)(ulong)uVar34)
                ;
                dVar98 = atan2(dVar98,dVar100);
                if ((local_aa0 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = (int)*(long *)((long)local_aa0 + 8) + -1,
                   *(int *)((long)local_aa0 + 8) = iVar36, iVar36 == 0)) {
                  (**(code **)(*(long *)local_aa0 + 8))();
                }
                if ((local_cb0 != (long *)0x0) &&
                   (iVar36 = (int)local_cb0[1] + -1, *(int *)(local_cb0 + 1) = iVar36, iVar36 == 0))
                {
                  (**(code **)(*local_cb0 + 8))();
                }
                if ((local_b10 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = (int)*(long *)((long)local_b10 + 8) + -1,
                   *(int *)((long)local_b10 + 8) = iVar36, iVar36 == 0)) {
                  (**(code **)(*(long *)local_b10 + 8))();
                }
                if ((local_cd0 != (Point_2 *)0x0) &&
                   (iVar36 = *(int *)(local_cd0 + 8), *(int *)(local_cd0 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_cd0 + 8))();
                }
                sincos(dVar98 + dVar20,&dStack_e60,&local_e68);
                dVar98 = dStack_e60;
                dVar100 = local_e68 * 100.0;
                    /* try { // try from 004014e0 to 004014e3 has its CatchHandler @ 00405314 */
                plVar48 = ::operator_new(0x30);
                dVar101 = (double)(int)dVar100;
                *plVar48 = (long)(PTR_vtable_004de318 + 0x10);
                *(undefined4 *)(plVar48 + 1) = 1;
                plVar48[4] = 0;
                *(int *)(plVar48 + 5) = (int)dVar100;
                plVar48[2] = (long)-dVar101;
                plVar48[3] = (long)dVar101;
                    /* try { // try from 00401528 to 0040152b has its CatchHandler @ 0040564c */
                plVar47 = ::operator_new(0x30);
                puVar55 = PTR_vtable_004de318;
                dVar100 = (double)(int)(dVar98 * 100.0);
                *(undefined4 *)(plVar47 + 1) = 1;
                *plVar47 = (long)(puVar55 + 0x10);
                plVar47[4] = 0;
                *(int *)(plVar47 + 5) = (int)(dVar98 * 100.0);
                plVar47[2] = (long)-dVar100;
                plVar47[3] = (long)dVar100;
                uVar41 = fpcr;
                fpcr = 0x400000;
                    /* try { // try from 00401568 to 0040156b has its CatchHandler @ 00405764 */
                local_aa0 = ::operator_new(0x58);
                lVar103 = plVar48[3];
                lVar102 = plVar48[2];
                *(undefined4 *)(local_aa0 + 8) = 1;
                puVar55 = PTR_vtable_004de3d8;
                *(undefined8 *)(local_aa0 + 0x30) = 0;
                *(long **)(local_aa0 + 0x38) = plVar47;
                lVar93 = plVar47[1];
                lVar99 = plVar47[3];
                lVar85 = plVar47[2];
                lVar52 = plVar48[1];
                *(undefined **)local_aa0 = puVar55 + 0x10;
                *(int *)(plVar47 + 1) = (int)lVar93 + 1;
                *(int *)(plVar48 + 1) = (int)lVar52 + 1;
                *(long *)(local_aa0 + 0x18) = lVar103;
                *(long *)(local_aa0 + 0x10) = lVar102;
                *(long *)(local_aa0 + 0x28) = lVar99;
                *(long *)(local_aa0 + 0x20) = lVar85;
                *(long **)(local_aa0 + 0x48) = plVar48;
                fpcr = uVar41;
                CGAL::Handle::operator=((Handle *)local_e20,(Handle *)&local_aa0);
                if ((local_aa0 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = *(int *)(local_aa0 + 8), *(int *)(local_aa0 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_aa0 + 8))();
                }
                iVar36 = (int)plVar47[1] + -1;
                *(int *)(plVar47 + 1) = iVar36;
                if (iVar36 == 0) {
                  (**(code **)(*plVar47 + 8))(plVar47);
                }
                iVar36 = (int)plVar48[1] + -1;
                *(int *)(plVar48 + 1) = iVar36;
                if (iVar36 == 0) {
                  (**(code **)(*plVar48 + 8))(plVar48);
                }
              }
              local_b00 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)0x0;
              local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0;
              pvStack_b08 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)0x0;
              uVar59 = *(long *)(pPVar82 + 8) - *(long *)pPVar82;
              if ((long)uVar59 >> 3 != 0) {
                if (0xfffffffffffffff < (ulong)((long)uVar59 >> 3)) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 004048b8 to 004048bb has its CatchHandler @ 00405314 */
                  std::__throw_bad_alloc();
                }
                    /* try { // try from 0040165c to 0040165f has its CatchHandler @ 00405314 */
                pvVar40 = ::operator_new(uVar59);
              }
              local_b00 = pvVar40 + uVar59;
              plVar48 = *(long **)pPVar82;
              plVar47 = *(long **)(pPVar82 + 8);
              plVar49 = plVar48;
              pvVar56 = pvVar40;
              pvStack_b08 = pvVar40;
              if (plVar48 != plVar47) {
                do {
                  plVar65 = plVar49 + 1;
                  lVar93 = *plVar49;
                  *(long *)pvVar56 = lVar93;
                  *(int *)(lVar93 + 8) = *(int *)(lVar93 + 8) + 1;
                  plVar49 = plVar65;
                  pvVar56 = pvVar56 + 8;
                } while (plVar47 != plVar65);
                pvStack_b08 = pvVar40 + ((long)plVar47 - (long)plVar48);
              }
              local_af0 = 0;
              local_ae8 = 0;
              uStack_ad8 = 0;
              local_ae0 = 0;
              uStack_ac8 = 0;
              local_ad0 = 0;
              uStack_ab8 = 0;
              local_ac0 = 0;
              uStack_aa8 = 0;
              local_ab0 = 0;
              local_b10 = pvVar40;
                    /* try { // try from 004016e0 to 004016e3 has its CatchHandler @ 00404cd0 */
              std::
              _Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::_M_initialize_map((_Deque_base<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                                   *)&local_af0,0);
                    /* try { // try from 004016ec to 004016ef has its CatchHandler @ 00404c6c */
              polygon_coverage_planning::visibility_graph::VisibilityGraph::VisibilityGraph
                        ((VisibilityGraph *)&local_aa0,(Polygon_with_holes_2 *)&local_b10);
              std::
              deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::~deque((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                        *)&local_af0);
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_b10);
                    /* try { // try from 00401704 to 00401707 has its CatchHandler @ 00404c2c */
              local_b10 = ::operator_new(0x30);
              puVar55 = PTR_vtable_004de318;
              dVar98 = (double)(int)cVar39;
              *(undefined4 *)(local_b10 + 8) = 1;
              *(undefined **)local_b10 = puVar55 + 0x10;
              *(undefined8 *)(local_b10 + 0x20) = 0;
              *(int *)(local_b10 + 0x28) = (int)cVar39;
              *(double *)(local_b10 + 0x10) = -dVar98;
              *(double *)(local_b10 + 0x18) = dVar98;
                    /* try { // try from 00401758 to 0040175b has its CatchHandler @ 0040545c */
              polygon_coverage_planning::computeSweep
                        (pPVar82,(_InputArray *)&local_aa0,(_InputArray *)&local_b10,
                         (Handle *)local_e20,1,(vector *)&local_c90);
              if ((local_b10 !=
                   (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                    *)0x0) &&
                 (iVar36 = *(int *)(local_b10 + 8), *(int *)(local_b10 + 8) = iVar36 + -1,
                 iVar36 + -1 == 0)) {
                (**(code **)(*(long *)local_b10 + 8))();
              }
              if (((local_cf0 != local_ce8) &&
                  (pEVar66 = *(Epeck **)(local_ce8 + -0x10),
                  *(Epeck **)(local_ce8 + -0x18) != pEVar66)) && (local_c90 != (Point_2 *)local_c88)
                 ) {
                    /* try { // try from 004017b8 to 004017bb has its CatchHandler @ 00404c2c */
                CGAL::internal::squared_distance<CGAL::Epeck>
                          ((Point_2 *)(pEVar66 + -8),local_c90,pEVar66);
                    /* try { // try from 004017d8 to 004017db has its CatchHandler @ 00405454 */
                CGAL::internal::squared_distance<CGAL::Epeck>
                          ((Point_2 *)(*(long *)(local_ce8 + -0x10) + -8),
                           (Point_2 *)(local_c88 + -8),pEVar66);
                    /* try { // try from 004017e0 to 004017e3 has its CatchHandler @ 0040544c */
                this_01 = ::operator_new(0x48);
                CGAL::
                Lazy_exact_Sub<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>
                ::Lazy_exact_Sub(this_01,(Lazy_exact_nt *)&local_cd0,(Lazy_exact_nt *)&local_cb0);
                local_b10 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)this_01;
                    /* try { // try from 004017fc to 004017ff has its CatchHandler @ 004053d0 */
                CGAL::
                Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                ::To_double::operator()((To_double *)&local_b10,extraout_x1);
                if ((local_b10 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = *(int *)(local_b10 + 8), *(int *)(local_b10 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_b10 + 8))();
                }
                if ((local_cb0 != (long *)0x0) &&
                   (iVar36 = (int)local_cb0[1] + -1, *(int *)(local_cb0 + 1) = iVar36, iVar36 == 0))
                {
                  (**(code **)(*local_cb0 + 8))();
                }
                if ((local_cd0 != (Point_2 *)0x0) &&
                   (iVar36 = *(int *)(local_cd0 + 8), *(int *)(local_cd0 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)local_cd0 + 8))();
                }
              }
              if (local_ce0 == local_ce8) {
                    /* try { // try from 00402b4c to 00402b4f has its CatchHandler @ 00404c2c */
                std::
                vector<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,std::allocator<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
                ::
                _M_realloc_insert<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>&>
                          ((vector<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>,std::allocator<std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
                            *)&local_cf0,local_ce8,(vector *)&local_c90);
              }
              else {
                    /* try { // try from 00401880 to 00401883 has its CatchHandler @ 00404c2c */
                std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                vector(local_ce8,(vector *)&local_c90);
                local_ce8 = local_ce8 + 0x18;
              }
              local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)(PTR_vtable_004de9f0 + 0x10);
              std::
              deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::~deque(adStack_9e8);
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector(avStack_a08);
              local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)(PTR_vtable_004ddf30 + 0x10);
              pvVar44 = local_a40;
              while (pvVar44 != (void *)0x0) {
                std::
                _Rb_tree<std::pair<unsigned_long,unsigned_long>,std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>,std::_Select1st<std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>>,std::less<std::pair<unsigned_long,unsigned_long>>,std::allocator<std::pair<std::pair<unsigned_long,unsigned_long>const,polygon_coverage_planning::visibility_graph::EdgeProperty>>>
                ::_M_erase(a_Stack_a50,*(_Rb_tree_node **)((long)pvVar44 + 0x18));
                pvVar88 = *(void **)((long)pvVar44 + 0x10);
                ::operator_delete(pvVar44);
                pvVar44 = pvVar88;
              }
              std::
              _Rb_tree<unsigned_long,std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>,std::_Select1st<std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,polygon_coverage_planning::visibility_graph::NodeProperty>>>
              ::_M_erase(a_Stack_a80,local_a70);
              p_Var15 = p_Stack_a90;
              p_Var14 = p_Stack_a90;
              for (p_Var1 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                             *)local_a98; p_Var1 != p_Var15; p_Var1 = p_Var1 + 0x30) {
                pvVar44 = *(void **)(p_Var1 + 0x10);
                while (pvVar44 != (void *)0x0) {
                  std::
                  _Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                  ::_M_erase(p_Var1,*(_Rb_tree_node **)((long)pvVar44 + 0x18));
                  pvVar88 = *(void **)((long)pvVar44 + 0x10);
                  ::operator_delete(pvVar44);
                  pvVar44 = pvVar88;
                }
                p_Var14 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                           *)local_a98;
              }
              if (p_Var14 !=
                  (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                   *)0x0) {
                ::operator_delete(p_Var14);
              }
              if ((local_e20[0] != (long *)0x0) &&
                 (iVar36 = (int)local_e20[0][1] + -1, *(int *)(local_e20[0] + 1) = iVar36,
                 iVar36 == 0)) {
                (**(code **)(*local_e20[0] + 8))();
              }
              std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
              ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                       *)&local_c90);
              pPVar82 = pPVar82 + 0x20;
            } while (pPVar24 != pPVar82);
            if (local_ce8 != local_cf0) {
              local_f48 = 0;
              local_f2c = 0;
              pvVar54 = local_cf0;
              pvVar72 = local_ce8;
              do {
                lVar77 = local_f48 * 0x18;
                pPVar92 = *(Point_2 **)(pvVar54 + local_f48 * 0x18);
                lVar93 = *(long *)(pvVar54 + lVar77 + 8);
                pEVar66 = (Epeck *)(lVar93 - (long)pPVar92);
                if (pEVar66 < (Epeck *)&DAT_00000020) {
                  local_f48 = (ulong)(local_f2c + 1);
                }
                else {
                  pPVar83 = (Point_2 *)(lVar93 + -8);
                  pPVar2 = pPVar92 + 8;
                  pPVar53 = (Point_2 *)(lVar93 + -0x10);
                    /* try { // try from 00401a40 to 00401a43 has its CatchHandler @ 004053c8 */
                  CGAL::internal::squared_distance<CGAL::Epeck>(pPVar92,pPVar2,pEVar66);
                    /* try { // try from 00401a50 to 00401a53 has its CatchHandler @ 004053c0 */
                  CGAL::internal::squared_distance<CGAL::Epeck>(pPVar83,pPVar53,pEVar66);
                    /* try { // try from 00401a58 to 00401b4f has its CatchHandler @ 004053b8 */
                  bVar33 = CGAL::operator<((Lazy_exact_nt *)&local_c90,extraout_w1);
                  if (bVar33) {
                    std::
                    vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
                    _M_erase(local_cf0 + lVar77,pPVar92);
                    uVar59 = (ulong)(local_f2c + 1);
                  }
                  else {
                    bVar33 = CGAL::operator<((Lazy_exact_nt *)&local_b10,extraout_w1_00);
                    uVar79 = (ulong)(local_f2c + 1U);
                    uVar59 = (ulong)(local_f2c + 1U);
                    if (bVar33) {
LAB_004027e0:
                      std::
                      vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                      ::_M_erase(local_cf0 + lVar77,pPVar83);
                    }
                    else {
                      lVar93 = (long)local_ce8 - (long)local_cf0;
                      uVar67 = (lVar93 >> 3) * -0x5555555555555555;
                      pvVar54 = local_cf0;
                      if (uVar59 <= uVar67 && uVar67 - uVar59 != 0) {
                        do {
                          lVar52 = uVar79 * 0x18;
                          pPVar89 = *(Point_2 **)(pvVar54 + uVar79 * 0x18);
                          lVar85 = *(long *)(pvVar54 + lVar52 + 8);
                          if (0x1f < (ulong)(lVar85 - (long)pPVar89)) {
                            pPVar3 = pPVar89 + 8;
                            pPVar94 = (Point_2 *)(lVar85 + -0x10);
                            bVar33 = CGAL::
                                     Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                     ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,(Point_2 *)pPVar2,
                                                  pPVar89);
                            iVar36 = (int)pvVar54;
                            if ((bVar33) &&
                               (pPVar69 = pPVar2,
                               bVar33 = CGAL::
                                        Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                        ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,(Point_2 *)pPVar2,
                                                  pPVar89 + 8), bVar33)) {
                    /* try { // try from 00403310 to 0040338b has its CatchHandler @ 004053b8 */
                              if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
                                 (rcutils_logging_initialize(), iVar36 != 0)) {
                                fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:531] error initializing logging: "
                                       ,1,0x65,*(FILE **)PTR_stderr_004deec0);
                                rcutils_get_error_string(local_808);
                                rcutils_get_error_string((string *)local_408);
                                sVar58 = strlen((char *)local_408);
                                fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
                                pPVar69 = (Point_2 *)0x1;
                                fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
                                rcutils_reset_error();
                              }
                              std::__cxx11::string::string<std::allocator<char>>
                                        ((string *)local_408,"coverage_planner_server",
                                         (allocator *)pPVar69);
                    /* try { // try from 00401b58 to 00401b5b has its CatchHandler @ 00405708 */
                              rclcpp::get_logger((string *)local_408);
                              uVar41 = 0;
                              if (local_aa0 !=
                                  (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                   *)0x0) {
                                uVar41 = *(undefined8 *)local_aa0;
                              }
                    /* try { // try from 00401b6c to 00401b6f has its CatchHandler @ 00404ec4 */
                              cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                              if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0)
                              {
                                std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                          (local_a98);
                              }
                              if (local_408[0] != auStack_3f8) {
                                ::operator_delete(local_408[0]);
                              }
                              if (cVar31 != '\0') {
                    /* try { // try from 00401ba8 to 00401bab has its CatchHandler @ 004053b8 */
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 00401bb4 to 00401bb7 has its CatchHandler @ 00404ebc */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 00401bd8 to 00401bdb has its CatchHandler @ 00404eb8 */
                                rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                            ::__rcutils_logging_location,10,uVar41,
                                            "cell %d head collinear with cell  %d head",local_f2c,
                                            uVar79);
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                              }
                    /* try { // try from 00401c0c to 00401c43 has its CatchHandler @ 004053b8 */
                              bVar33 = CGAL::
                                       Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                       ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,pPVar89,
                                                  (Point_2 *)pPVar2);
                              if (bVar33) {
                                CGAL::
                                Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                              *)&local_aa0,(Point_2 *)pPVar92,pPVar89 + 8,
                                             (Point_2 *)pPVar2);
                              }
                              pPVar69 = pPVar2;
                              bVar33 = CGAL::
                                       Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                       ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar89,(Point_2 *)pPVar2,pPVar89 + 8
                                                  );
                    /* try { // try from 004020cc to 004020fb has its CatchHandler @ 004053b8 */
                              if ((bVar33) &&
                                 (pPVar69 = pPVar92,
                                 bVar33 = CGAL::
                                          Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                          ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar89,(Point_2 *)pPVar92,pPVar3),
                                 bVar33)) {
                                if (cVar31 == '\0') {
                                  if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
                                    rcutils_logging_initialize();
                                  }
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 00402104 to 00402107 has its CatchHandler @ 00404a84 */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 00402118 to 0040211b has its CatchHandler @ 00404928 */
                                  cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                  if (cVar31 != '\0') {
                    /* try { // try from 00402150 to 00402153 has its CatchHandler @ 004053b8 */
                                    std::__cxx11::string::string<std::allocator<char>>
                                              ((string *)local_408,"coverage_planner_server",
                                               (allocator *)pPVar69);
                    /* try { // try from 0040215c to 0040215f has its CatchHandler @ 00404b84 */
                                    rclcpp::get_logger((string *)local_408);
                                    uVar41 = 0;
                                    if (local_aa0 !=
                                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                         *)0x0) {
                                      uVar41 = *(undefined8 *)local_aa0;
                                    }
                    /* try { // try from 00402184 to 00402187 has its CatchHandler @ 00404b80 */
                                    rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                ::__rcutils_logging_location,10,uVar41,
                                                "--------->Remove repeat line on cell: %d",local_f2c
                                               );
LAB_00402188:
                                    if (local_a98 !=
                                        (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                                (local_a98);
                                    }
                                    if (local_408[0] != auStack_3f8) {
                                      ::operator_delete(local_408[0]);
                                    }
                                  }
LAB_004021a8:
                                  std::
                                  vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                                  ::_M_erase(local_cf0 + lVar77,
                                             *(undefined8 *)(local_cf0 + local_f48 * 0x18));
                                  break;
                                }
                              }
                              else if (cVar31 == '\0') goto LAB_00401c50;
                              if (cVar31 == '\0') {
                                rcutils_logging_initialize();
                              }
                    /* try { // try from 00403cc4 to 00403cc7 has its CatchHandler @ 004053b8 */
                              std::__cxx11::string::string<std::allocator<char>>
                                        ((string *)local_408,"coverage_planner_server",
                                         (allocator *)pPVar69);
                    /* try { // try from 00403cd0 to 00403cd3 has its CatchHandler @ 00404fdc */
                              rclcpp::get_logger((string *)local_408);
                              uVar41 = 0;
                              if (local_aa0 !=
                                  (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                   *)0x0) {
                                uVar41 = *(undefined8 *)local_aa0;
                              }
                    /* try { // try from 00403ce4 to 00403ce7 has its CatchHandler @ 00405004 */
                              cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                              if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0)
                              {
                                std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                          (local_a98);
                              }
                              if (local_408[0] != auStack_3f8) {
                                ::operator_delete(local_408[0]);
                              }
                              if (cVar31 != '\0') {
                    /* try { // try from 00403d1c to 00403d1f has its CatchHandler @ 004053b8 */
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 00403d28 to 00403d2b has its CatchHandler @ 00404ffc */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 00403d50 to 00403d53 has its CatchHandler @ 00404ff8 */
                                rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                            ::__rcutils_logging_location,10,uVar41,
                                            "--------->Remove repeat line on cell: %d",uVar79);
LAB_00403d54:
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                              }
LAB_00403d74:
                              std::
                              vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              ::_M_erase(local_cf0 + lVar52,pPVar89);
                            }
                            else {
                    /* try { // try from 004021d4 to 0040221f has its CatchHandler @ 004053b8 */
                              bVar33 = CGAL::
                                       Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                       ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,(Point_2 *)pPVar2,
                                                  pPVar94);
                              pPVar86 = (Point_2 *)(lVar85 + -8);
                              if ((bVar33) &&
                                 (pPVar69 = pPVar2,
                                 bVar33 = CGAL::
                                          Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                          ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,(Point_2 *)pPVar2,
                                                  pPVar86), bVar33)) {
                    /* try { // try from 0040351c to 0040359b has its CatchHandler @ 004053b8 */
                                if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
                                   (rcutils_logging_initialize(), iVar36 != 0)) {
                                  fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:551] error initializing logging: "
                                         ,1,0x65,*(FILE **)PTR_stderr_004deec0);
                                  rcutils_get_error_string(local_808);
                                  rcutils_get_error_string((string *)local_408);
                                  sVar58 = strlen((char *)local_408);
                                  fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
                                  pPVar69 = (Point_2 *)0x1;
                                  fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
                                  rcutils_reset_error();
                                }
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 00402228 to 0040222b has its CatchHandler @ 00405390 */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 0040223c to 0040223f has its CatchHandler @ 00405398 */
                                cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                                if (cVar31 != '\0') {
                    /* try { // try from 00402278 to 0040227b has its CatchHandler @ 004053b8 */
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 00402284 to 00402287 has its CatchHandler @ 0040537c */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 004022b0 to 004022b3 has its CatchHandler @ 00405378 */
                                  rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                              ::__rcutils_logging_location,10,uVar41,
                                              "cell %d head collinear with cell  %d tail ",local_f2c
                                              ,uVar79);
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                }
                    /* try { // try from 004022e4 to 00402347 has its CatchHandler @ 004053b8 */
                                bVar33 = CGAL::
                                         Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                         ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar92,pPVar94,
                                                  (Point_2 *)pPVar2);
                                if (bVar33) {
                                  CGAL::
                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                  ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                *)&local_aa0,(Point_2 *)pPVar92,pPVar86,
                                               (Point_2 *)pPVar2);
                                }
                                pPVar69 = pPVar2;
                                bVar33 = CGAL::
                                         Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                         ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar94,(Point_2 *)pPVar2,pPVar86);
                    /* try { // try from 0040241c to 0040244b has its CatchHandler @ 004053b8 */
                                if ((bVar33) &&
                                   (pPVar69 = pPVar92,
                                   bVar33 = CGAL::
                                            Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                            ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar94,(Point_2 *)pPVar92,pPVar86),
                                   bVar33)) {
                                  if (cVar31 == '\0') {
                                    if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
                                      rcutils_logging_initialize();
                                    }
                                    std::__cxx11::string::string<std::allocator<char>>
                                              ((string *)local_408,"coverage_planner_server",
                                               (allocator *)pPVar69);
                    /* try { // try from 00402454 to 00402457 has its CatchHandler @ 00404b60 */
                                    rclcpp::get_logger((string *)local_408);
                                    uVar41 = 0;
                                    if (local_aa0 !=
                                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                         *)0x0) {
                                      uVar41 = *(undefined8 *)local_aa0;
                                    }
                    /* try { // try from 00402468 to 0040246b has its CatchHandler @ 00404b8c */
                                    cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                    if (local_a98 !=
                                        (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                                (local_a98);
                                    }
                                    if (local_408[0] != auStack_3f8) {
                                      ::operator_delete(local_408[0]);
                                    }
                                    if (cVar31 != '\0') {
                    /* try { // try from 004024a0 to 004024a3 has its CatchHandler @ 004053b8 */
                                      std::__cxx11::string::string<std::allocator<char>>
                                                ((string *)local_408,"coverage_planner_server",
                                                 (allocator *)pPVar69);
                    /* try { // try from 004024ac to 004024af has its CatchHandler @ 00404bb0 */
                                      rclcpp::get_logger((string *)local_408);
                                      uVar41 = 0;
                                      if (local_aa0 !=
                                          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                           *)0x0) {
                                        uVar41 = *(undefined8 *)local_aa0;
                                      }
                    /* try { // try from 004024d4 to 004024d7 has its CatchHandler @ 00404bac */
                                      rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                  ::__rcutils_logging_location,10,uVar41,
                                                  "--------->Remove repeat line on cell: %d",
                                                  local_f2c);
                                      goto LAB_00402188;
                                    }
                                    goto LAB_004021a8;
                                  }
                                }
                                else if (cVar31 == '\0') goto LAB_00401c50;
                                if (cVar31 == '\0') {
                                  rcutils_logging_initialize();
                                }
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 00402350 to 00402353 has its CatchHandler @ 00404fd4 */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 00402364 to 00402367 has its CatchHandler @ 00404b68 */
                                cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                                if (cVar31 != '\0') {
                    /* try { // try from 0040239c to 0040239f has its CatchHandler @ 004053b8 */
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 004023a8 to 004023ab has its CatchHandler @ 00404bbc */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 004023d0 to 004023d3 has its CatchHandler @ 00404bb8 */
                                  rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                              ::__rcutils_logging_location,10,uVar41,
                                              "--------->Remove repeat line on cell: %d",uVar79);
LAB_004023d4:
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                }
                              }
                              else {
                    /* try { // try from 004024ec to 00402533 has its CatchHandler @ 004053b8 */
                                bVar33 = CGAL::
                                         Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                         ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,(Point_2 *)pPVar53
                                                  ,pPVar94);
                                if ((!bVar33) ||
                                   (pPVar69 = pPVar53,
                                   bVar33 = CGAL::
                                            Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                            ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,(Point_2 *)pPVar53
                                                  ,pPVar86), !bVar33)) {
                    /* try { // try from 00402804 to 0040284b has its CatchHandler @ 004053b8 */
                                  bVar33 = CGAL::
                                           Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                           ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,(Point_2 *)pPVar53
                                                  ,pPVar89);
                                  if ((!bVar33) ||
                                     (pPVar69 = pPVar53,
                                     bVar33 = CGAL::
                                              Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                              ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Mpzf>>,CGAL::CartesianKernelFunctors::Collinear_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Mpzf>,CGAL::NT_converter<double,CGAL::Mpzf>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,(Point_2 *)pPVar53
                                                  ,pPVar3), !bVar33)) {
LAB_00401c50:
                                    lVar93 = (long)local_ce8 - (long)local_cf0;
                                    pvVar54 = local_cf0;
                                    goto LAB_00401c5c;
                                  }
                    /* try { // try from 00403bac to 00403c27 has its CatchHandler @ 004053b8 */
                                  if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
                                     (rcutils_logging_initialize(), iVar36 != 0)) {
                                    fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:592] error initializing logging: "
                                           ,1,0x65,*(FILE **)PTR_stderr_004deec0);
                                    rcutils_get_error_string(local_808);
                                    rcutils_get_error_string((string *)local_408);
                                    sVar58 = strlen((char *)local_408);
                                    fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
                                    pPVar69 = (Point_2 *)0x1;
                                    fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
                                    rcutils_reset_error();
                                  }
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 00402854 to 00402857 has its CatchHandler @ 00405510 */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 00402868 to 0040286b has its CatchHandler @ 0040554c */
                                  cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                  if (cVar31 != '\0') {
                    /* try { // try from 004028a4 to 004028a7 has its CatchHandler @ 004053b8 */
                                    std::__cxx11::string::string<std::allocator<char>>
                                              ((string *)local_408,"coverage_planner_server",
                                               (allocator *)pPVar69);
                    /* try { // try from 004028b0 to 004028b3 has its CatchHandler @ 004054fc */
                                    rclcpp::get_logger((string *)local_408);
                                    uVar41 = 0;
                                    if (local_aa0 !=
                                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                         *)0x0) {
                                      uVar41 = *(undefined8 *)local_aa0;
                                    }
                    /* try { // try from 004028dc to 004028df has its CatchHandler @ 0040550c */
                                    rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                ::__rcutils_logging_location,10,uVar41,
                                                "cell %d tail collinear with cell  %d head: ",
                                                local_f2c,uVar79);
                                    if (local_a98 !=
                                        (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                                (local_a98);
                                    }
                                    if (local_408[0] != auStack_3f8) {
                                      ::operator_delete(local_408[0]);
                                    }
                                  }
                    /* try { // try from 00402914 to 00402977 has its CatchHandler @ 004053b8 */
                                  bVar33 = CGAL::
                                           Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                           ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,pPVar89,
                                                  (Point_2 *)pPVar53);
                                  if (bVar33) {
                                    CGAL::
                                    Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                    ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,pPVar3,
                                                 (Point_2 *)pPVar53);
                                  }
                                  pPVar69 = pPVar53;
                                  bVar33 = CGAL::
                                           Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                           ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar89,(Point_2 *)pPVar53,pPVar3);
                    /* try { // try from 00402a18 to 00402a47 has its CatchHandler @ 004053b8 */
                                  if ((bVar33) &&
                                     (pPVar69 = pPVar83,
                                     bVar33 = CGAL::
                                              Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                              ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar89,(Point_2 *)pPVar83,pPVar3),
                                     bVar33)) {
                                    if (cVar31 == '\0') {
                                      if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
                                        rcutils_logging_initialize();
                                      }
                                      std::__cxx11::string::string<std::allocator<char>>
                                                ((string *)local_408,"coverage_planner_server",
                                                 (allocator *)pPVar69);
                    /* try { // try from 00402a50 to 00402a53 has its CatchHandler @ 00404b9c */
                                      rclcpp::get_logger((string *)local_408);
                                      uVar41 = 0;
                                      if (local_aa0 !=
                                          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                           *)0x0) {
                                        uVar41 = *(undefined8 *)local_aa0;
                                      }
                    /* try { // try from 00402a64 to 00402a67 has its CatchHandler @ 00404fc8 */
                                      cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                      if (local_a98 !=
                                          (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::
                                        _M_release(local_a98);
                                      }
                                      if (local_408[0] != auStack_3f8) {
                                        ::operator_delete(local_408[0]);
                                      }
                                      if (cVar31 != '\0') {
                    /* try { // try from 00402a9c to 00402a9f has its CatchHandler @ 004053b8 */
                                        std::__cxx11::string::string<std::allocator<char>>
                                                  ((string *)local_408,"coverage_planner_server",
                                                   (allocator *)pPVar69);
                    /* try { // try from 00402aa8 to 00402aab has its CatchHandler @ 00404fc0 */
                                        rclcpp::get_logger((string *)local_408);
                                        uVar41 = 0;
                                        if (local_aa0 !=
                                            (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                             *)0x0) {
                                          uVar41 = *(undefined8 *)local_aa0;
                                        }
                    /* try { // try from 00402ad0 to 00402ad3 has its CatchHandler @ 00404fcc */
                                        rcutils_log(
                                                  getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                  ::__rcutils_logging_location,10,uVar41,
                                                  "--------->Remove repeat line on cell: %d",
                                                  local_f2c);
                                        goto LAB_004027b8;
                                      }
                                      goto LAB_004027e0;
                                    }
                                  }
                                  else if (cVar31 == '\0') goto LAB_00401c50;
                                  if (cVar31 == '\0') {
                                    rcutils_logging_initialize();
                                  }
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 00402980 to 00402983 has its CatchHandler @ 00404fb0 */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 00402994 to 00402997 has its CatchHandler @ 00404fb8 */
                                  cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                  if (cVar31 != '\0') {
                    /* try { // try from 004029cc to 004029cf has its CatchHandler @ 004053b8 */
                                    std::__cxx11::string::string<std::allocator<char>>
                                              ((string *)local_408,"coverage_planner_server",
                                               (allocator *)pPVar69);
                    /* try { // try from 004029d8 to 004029db has its CatchHandler @ 00404b90 */
                                    rclcpp::get_logger((string *)local_408);
                                    uVar41 = 0;
                                    if (local_aa0 !=
                                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                         *)0x0) {
                                      uVar41 = *(undefined8 *)local_aa0;
                                    }
                    /* try { // try from 00402a00 to 00402a03 has its CatchHandler @ 00404fd0 */
                                    rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                ::__rcutils_logging_location,10,uVar41,
                                                "--------->Remove repeat line on cell: %d",uVar79);
                                    goto LAB_00403d54;
                                  }
                                  goto LAB_00403d74;
                                }
                    /* try { // try from 004036a0 to 0040371f has its CatchHandler @ 004053b8 */
                                if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
                                   (rcutils_logging_initialize(), iVar36 != 0)) {
                                  fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:571] error initializing logging: "
                                         ,1,0x65,*(FILE **)PTR_stderr_004deec0);
                                  rcutils_get_error_string(local_808);
                                  rcutils_get_error_string((string *)local_408);
                                  sVar58 = strlen((char *)local_408);
                                  fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
                                  pPVar69 = (Point_2 *)0x1;
                                  fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
                                  rcutils_reset_error();
                                }
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 0040253c to 0040253f has its CatchHandler @ 00404d8c */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 00402550 to 00402553 has its CatchHandler @ 00404c94 */
                                cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                                if (cVar31 != '\0') {
                    /* try { // try from 0040258c to 0040258f has its CatchHandler @ 004053b8 */
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 00402598 to 0040259b has its CatchHandler @ 00404c8c */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 004025c4 to 004025c7 has its CatchHandler @ 004051a4 */
                                  rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                              ::__rcutils_logging_location,10,uVar41,
                                              "cell %d tail collinear with cell  %d tail ",local_f2c
                                              ,uVar79);
                                  if (local_a98 !=
                                      (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                              (local_a98);
                                  }
                                  if (local_408[0] != auStack_3f8) {
                                    ::operator_delete(local_408[0]);
                                  }
                                }
                    /* try { // try from 004025f8 to 0040265b has its CatchHandler @ 004053b8 */
                                bVar33 = CGAL::
                                         Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                         ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,(Point_2 *)pPVar83,pPVar94,
                                                  (Point_2 *)pPVar53);
                                if (bVar33) {
                                  CGAL::
                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                  ::operator()((Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                *)&local_aa0,(Point_2 *)pPVar83,pPVar86,
                                               (Point_2 *)pPVar53);
                                }
                                pPVar69 = pPVar53;
                                bVar33 = CGAL::
                                         Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                         ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar94,(Point_2 *)pPVar53,pPVar86);
                    /* try { // try from 004026fc to 0040272b has its CatchHandler @ 004053b8 */
                                if ((bVar33) &&
                                   (pPVar69 = pPVar83,
                                   bVar33 = CGAL::
                                            Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                            ::operator()((
                                                  Static_filtered_predicate<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Exact_converter<CGAL::Epeck,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Approx_converter<CGAL::Epeck,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,true>,CGAL::Filtered_predicate<CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::CartesianKernelFunctors::Collinear_are_ordered_along_line_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>,CGAL::NT_converter<double,boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>,CGAL::Cartesian_converter<CGAL::Type_equality_wrapper<CGAL::Cartesian_base_no_ref_count<double,CGAL::Epick>,CGAL::Epick>,CGAL::Simple_cartesian<CGAL::Interval_nt<false>>,CGAL::NT_converter<double,CGAL::Interval_nt<false>>>,true>>
                                                  *)&local_aa0,pPVar94,(Point_2 *)pPVar83,pPVar86),
                                   bVar33)) {
                                  if (cVar31 == '\0') {
                                    if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
                    /* try { // try from 00404404 to 0040457f has its CatchHandler @ 004053b8 */
                                      rcutils_logging_initialize();
                                    }
                                    std::__cxx11::string::string<std::allocator<char>>
                                              ((string *)local_408,"coverage_planner_server",
                                               (allocator *)pPVar69);
                    /* try { // try from 00402734 to 00402737 has its CatchHandler @ 00404b78 */
                                    rclcpp::get_logger((string *)local_408);
                                    uVar41 = 0;
                                    if (local_aa0 !=
                                        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                         *)0x0) {
                                      uVar41 = *(undefined8 *)local_aa0;
                                    }
                    /* try { // try from 00402748 to 0040274b has its CatchHandler @ 00404fac */
                                    cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                    if (local_a98 !=
                                        (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                                (local_a98);
                                    }
                                    if (local_408[0] != auStack_3f8) {
                                      ::operator_delete(local_408[0]);
                                    }
                                    if (cVar31 != '\0') {
                    /* try { // try from 00402780 to 00402783 has its CatchHandler @ 004053b8 */
                                      std::__cxx11::string::string<std::allocator<char>>
                                                ((string *)local_408,"coverage_planner_server",
                                                 (allocator *)pPVar69);
                    /* try { // try from 0040278c to 0040278f has its CatchHandler @ 00404ff0 */
                                      rclcpp::get_logger((string *)local_408);
                                      uVar41 = 0;
                                      if (local_aa0 !=
                                          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                           *)0x0) {
                                        uVar41 = *(undefined8 *)local_aa0;
                                      }
                    /* try { // try from 004027b4 to 004027b7 has its CatchHandler @ 00404b98 */
                                      rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                                  ::__rcutils_logging_location,10,uVar41,
                                                  "--------->Remove repeat line on cell: %d",
                                                  local_f2c);
LAB_004027b8:
                                      if (local_a98 !=
                                          (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                                        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::
                                        _M_release(local_a98);
                                      }
                                      if (local_408[0] != auStack_3f8) {
                                        ::operator_delete(local_408[0]);
                                      }
                                    }
                                    goto LAB_004027e0;
                                  }
                                }
                                else if (cVar31 == '\0') goto LAB_00401c50;
                                if (cVar31 == '\0') {
                    /* try { // try from 00404604 to 0040487f has its CatchHandler @ 004053b8 */
                                  rcutils_logging_initialize();
                                }
                                std::__cxx11::string::string<std::allocator<char>>
                                          ((string *)local_408,"coverage_planner_server",
                                           (allocator *)pPVar69);
                    /* try { // try from 00402664 to 00402667 has its CatchHandler @ 00404b70 */
                                rclcpp::get_logger((string *)local_408);
                                uVar41 = 0;
                                if (local_aa0 !=
                                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                     *)0x0) {
                                  uVar41 = *(undefined8 *)local_aa0;
                                }
                    /* try { // try from 00402678 to 0040267b has its CatchHandler @ 00404b6c */
                                cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,10);
                                if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0
                                   ) {
                                  std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release
                                            (local_a98);
                                }
                                if (local_408[0] != auStack_3f8) {
                                  ::operator_delete(local_408[0]);
                                }
                                if (cVar31 != '\0') {
                    /* try { // try from 004026b0 to 004026b3 has its CatchHandler @ 004053b8 */
                                  std::__cxx11::string::string<std::allocator<char>>
                                            ((string *)local_408,"coverage_planner_server",
                                             (allocator *)pPVar69);
                    /* try { // try from 004026bc to 004026bf has its CatchHandler @ 00404ba4 */
                                  rclcpp::get_logger((string *)local_408);
                                  uVar41 = 0;
                                  if (local_aa0 !=
                                      (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                       *)0x0) {
                                    uVar41 = *(undefined8 *)local_aa0;
                                  }
                    /* try { // try from 004026e4 to 004026e7 has its CatchHandler @ 00404fbc */
                                  rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                                              ::__rcutils_logging_location,10,uVar41,
                                              "--------->Remove repeat line on cell: %d",uVar79);
                                  goto LAB_004023d4;
                                }
                              }
                              std::
                              vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              ::_M_erase(local_cf0 + lVar52,pPVar94);
                            }
                            break;
                          }
LAB_00401c5c:
                          uVar79 = (ulong)((int)uVar79 + 1);
                          uVar67 = (lVar93 >> 3) * -0x5555555555555555;
                        } while (uVar79 <= uVar67 && uVar67 - uVar79 != 0);
                      }
                    }
                  }
                  local_f48 = uVar59;
                  if ((local_b10 !=
                       (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                        *)0x0) &&
                     (iVar36 = *(int *)(local_b10 + 8), *(int *)(local_b10 + 8) = iVar36 + -1,
                     iVar36 + -1 == 0)) {
                    (**(code **)(*(long *)local_b10 + 8))();
                  }
                  pvVar54 = local_cf0;
                  pvVar72 = local_ce8;
                  if ((local_c90 != (Point_2 *)0x0) &&
                     (iVar36 = *(int *)(local_c90 + 8), *(int *)(local_c90 + 8) = iVar36 + -1,
                     iVar36 + -1 == 0)) {
                    (**(code **)(*(long *)local_c90 + 8))();
                    pvVar54 = local_cf0;
                    pvVar72 = local_ce8;
                  }
                }
                local_f2c = local_f2c + 1;
                uVar59 = ((long)pvVar72 - (long)pvVar54 >> 3) * -0x5555555555555555;
              } while (local_f48 <= uVar59 && uVar59 - local_f48 != 0);
            }
          }
                    /* try { // try from 00402b8c to 00402b8f has its CatchHandler @ 004053c8 */
          calculateCellIntersections_abi_cxx11_((vector *)&local_d10,(vector *)&local_c48);
          piVar80 = local_ba0;
          local_e30 = local_e38;
          uVar34 = (int)*(long *)(param_7 + 0x28) - 1;
          if (*(long *)(param_7 + 0x28) == 0) {
            uVar34 = 0xffffffff;
          }
          uVar35 = (int)local_e38[1] + 1;
          paVar63 = (allocator *)(ulong)uVar35;
          local_f80 = local_ba8;
          *(uint *)(local_e38 + 1) = uVar35;
          local_cc0 = 0;
          local_ca0 = 0;
          pPStack_cc8 = (Point_2 *)0x0;
          local_cd0 = (Point_2 *)0x0;
          uStack_ca8 = 0;
          local_cb0 = (long *)0x0;
          if (local_ba0 != local_bc0) {
            piVar87 = local_bc0;
            piVar91 = local_bb0;
LAB_00402c10:
            do {
              paVar63 = (allocator *)0x60;
              if (local_c48[(long)*piVar87 * 0x60 + 1] == (Lazy_exact_nt)0x0) {
                local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)((long)pPStack_cc8 - (long)local_cd0 >> 3);
                    /* try { // try from 00402df4 to 00402e6f has its CatchHandler @ 004055e8 */
                std::vector<int,std::allocator<int>>::emplace_back<unsigned_long>
                          ((vector<int,std::allocator<int>> *)&local_cb0,(ulong *)&local_aa0);
                pvVar56 = *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                            **)((vector *)(local_cf0 + (long)*piVar87 * 0x18) + 8);
                uVar59 = (long)pPStack_cc8 - (long)local_cd0 >> 3;
                pvVar40 = pvVar56;
                if (*(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      **)(local_cf0 + (long)*piVar87 * 0x18) == pvVar56) {
LAB_00402e60:
                  std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  ::
                  _M_range_insert<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>
                            ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              *)&local_cd0,pPStack_cc8,pvVar40,pvVar56,0);
                }
                else {
                  cVar31 = doReverseNextSweep((Point_2 *)&local_e30,
                                              (vector *)(local_cf0 + (long)*piVar87 * 0x18));
                  pvVar56 = *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                              **)(local_cf0 + (long)*piVar87 * 0x18 + 8);
                  pvVar40 = *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                              **)(local_cf0 + (long)*piVar87 * 0x18);
                  if (cVar31 == '\0') goto LAB_00402e60;
                  local_c90 = (Point_2 *)
                              *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                **)(local_cf0 + (long)*piVar87 * 0x18);
                  local_aa0 = pvVar56;
                    /* try { // try from 00403308 to 0040330b has its CatchHandler @ 004055e8 */
                  std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                  ::
                  _M_range_insert<std::reverse_iterator<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                            ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>
                              *)&local_cd0,pPStack_cc8,(_InputArray *)&local_aa0,
                             (vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>
                              *)&local_c90,0);
                }
                uVar79 = (long)pPStack_cc8 - (long)local_cd0 >> 3;
                if (uVar59 < uVar79) {
                  uVar67 = uVar59 & 0xffffffff;
                  local_c90 = (Point_2 *)0x0;
                  local_c88 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                               *)0x0;
                  local_c80 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                               *)0x0;
                  uVar34 = uVar34 + 1;
                  pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                             *)(ulong)uVar34;
                  if ((uVar59 & 0xffffffff) < uVar79) {
                    do {
                    /* try { // try from 00402f80 to 00402f83 has its CatchHandler @ 00405504 */
                      CGAL::
                      Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                      ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                                    *)(local_cd0 + uVar67 * 8),(Point_2 *)pvVar40);
                    /* try { // try from 00402f88 to 00402fa3 has its CatchHandler @ 004054f4 */
                      dVar98 = (double)CGAL::
                                       Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                                       ::To_double::operator()
                                                 ((To_double *)local_e20,extraout_x1_11);
                      local_e28 = (uint)dVar98;
                      CGAL::
                      Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                      ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                                    *)(local_cd0 + uVar67 * 8),(Point_2 *)(ulong)local_e28);
                    /* try { // try from 00402fa8 to 00402fcb has its CatchHandler @ 00405494 */
                      dVar98 = (double)CGAL::
                                       Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                                       ::To_double::operator()
                                                 ((To_double *)&local_aa0,extraout_x1_12);
                      local_e24 = (int)dVar98;
                      if (local_c88 == local_c80) {
                        std::
                        vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>
                        ::_M_realloc_insert<coverage_plan::StatusGridPos>
                                  ((vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>
                                    *)&local_c90,local_c88,&local_e28);
                        pvVar40 = extraout_x1_13;
                      }
                      else {
                        *(uint *)local_c88 = local_e28;
                        *(int *)(local_c88 + 4) = local_e24;
                        pvVar40 = local_c88;
                        local_c88 = local_c88 + 8;
                      }
                      if (local_aa0 !=
                          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)0x0) {
                        uVar35 = *(int *)(local_aa0 + 8) - 1;
                        pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                   *)(ulong)uVar35;
                        *(uint *)(local_aa0 + 8) = uVar35;
                        if (uVar35 == 0) {
                          (**(code **)(*(long *)local_aa0 + 8))();
                          pvVar40 = extraout_x1_09;
                        }
                      }
                      if (local_e20[0] != (long *)0x0) {
                        uVar35 = (int)local_e20[0][1] - 1;
                        pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                   *)(ulong)uVar35;
                        *(uint *)(local_e20[0] + 1) = uVar35;
                        if (uVar35 == 0) {
                          (**(code **)(*local_e20[0] + 8))();
                          pvVar40 = extraout_x1_10;
                        }
                      }
                      uVar67 = (ulong)((int)uVar67 + 1);
                    } while (uVar67 < uVar79);
                    local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                 *)CONCAT44(local_aa0._4_4_,uVar34);
                    local_a88 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                                 *)0x0;
                    local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0;
                    p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                                   *)0x0;
                    uVar59 = (long)local_c88 - (long)local_c90;
                    if ((long)uVar59 >> 3 == 0) goto LAB_00403974;
                    if (0xfffffffffffffff < (ulong)((long)uVar59 >> 3)) {
                    /* WARNING: Subroutine does not return */
                    /* try { // try from 004048b4 to 004048b7 has its CatchHandler @ 00405504 */
                      std::__throw_bad_alloc();
                    }
                    /* try { // try from 0040300c to 0040300f has its CatchHandler @ 00405504 */
                    p_Stack_a90 = ::operator_new(uVar59);
                    sVar58 = (long)local_c88 - (long)local_c90;
                  }
                  else {
                    uVar59 = 0;
                    local_aa0 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                                 *)CONCAT44(local_aa0._4_4_,uVar34);
LAB_00403974:
                    p_Stack_a90 = (_Rb_tree<unsigned_long,std::pair<unsigned_long_const,double>,std::_Select1st<std::pair<unsigned_long_const,double>>,std::less<unsigned_long>,std::allocator<std::pair<unsigned_long_const,double>>>
                                   *)0x0;
                    sVar58 = uVar59;
                  }
                  local_a88 = p_Stack_a90 + uVar59;
                  local_a98 = (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)p_Stack_a90;
                  if (local_c90 != (Point_2 *)local_c88) {
                    p_Stack_a90 = memmove(p_Stack_a90,local_c90,sVar58);
                  }
                  p_Stack_a90 = p_Stack_a90 + sVar58;
                    /* try { // try from 0040305c to 0040305f has its CatchHandler @ 004055b4 */
                  std::
                  _Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
                  ::
                  _M_insert_unique<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>
                            ((_Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
                              *)param_7,(pair *)&local_aa0);
                  if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
                    ::operator_delete(local_a98);
                  }
                  if (local_c90 != (Point_2 *)0x0) {
                    ::operator_delete(local_c90);
                  }
                }
                paVar63 = (allocator *)(local_c48 + (long)*piVar87 * 0x60);
                *(Lazy_exact_nt *)(paVar63 + 1) = (Lazy_exact_nt)0x1;
                CGAL::Handle::operator=((Handle *)&local_e30,(Handle *)(pPStack_cc8 + -8));
              }
              if (piVar87 + 1 != piVar91) {
                piVar87 = piVar87 + 1;
                if (piVar80 == piVar87) break;
                goto LAB_00402c10;
              }
              local_f80 = local_f80 + 1;
              piVar87 = (int *)*local_f80;
              piVar91 = piVar87 + 0x80;
            } while (piVar80 != piVar87);
          }
          cVar50 = clock();
                    /* try { // try from 00403e8c to 00403f07 has its CatchHandler @ 004055e8 */
          if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
             (rcutils_logging_initialize(), (int)cVar50 != 0)) {
            fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:647] error initializing logging: "
                   ,1,0x65,*(FILE **)PTR_stderr_004deec0);
            rcutils_get_error_string(local_808);
            rcutils_get_error_string((string *)local_408);
            sVar58 = strlen((char *)local_408);
            fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
            paVar63 = (allocator *)0x1;
            fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
            rcutils_reset_error();
          }
                    /* try { // try from 00402c60 to 00402c63 has its CatchHandler @ 004055e8 */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00402c6c to 00402c6f has its CatchHandler @ 004055dc */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 00402c80 to 00402c83 has its CatchHandler @ 004055d8 */
          pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)rcutils_logging_logger_is_enabled_for(uVar41,0x14);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (((ulong)pvVar40 & 0xff) != 0) {
                    /* try { // try from 004038e8 to 004038eb has its CatchHandler @ 004055e8 */
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004038f4 to 004038f7 has its CatchHandler @ 004055f0 */
            rclcpp::get_logger((string *)local_408);
            paVar63 = (allocator *)0x0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              paVar63 = *(allocator **)local_aa0;
            }
                    /* try { // try from 00403938 to 0040393b has its CatchHandler @ 00405574 */
            rcutils_log((double)(cVar50 - cVar39) / 1000000.0,
                        getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x14,paVar63,
                        "------3 - Cell sweep time cost: %.2f");
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
          }
          uVar59 = 0;
          pPVar89 = pPStack_cc8;
          if (local_cd0 != pPStack_cc8) {
            while( true ) {
              lVar77 = uVar59 * 8;
                    /* try { // try from 00402cd4 to 00402cd7 has its CatchHandler @ 004055e8 */
              CGAL::
              Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
              ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                            *)(local_cd0 + lVar77),pPVar89);
                    /* try { // try from 00402cdc to 00402cef has its CatchHandler @ 0040560c */
              CGAL::
              Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
              ::To_double::operator()((To_double *)&local_c90,extraout_x1_00);
              CGAL::
              Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
              ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                            *)(local_cd0 + lVar77),extraout_x1_01);
                    /* try { // try from 00402cf4 to 00402cf7 has its CatchHandler @ 004055e4 */
              CGAL::
              Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
              ::To_double::operator()((To_double *)&local_aa0,extraout_x1_02);
              if ((local_aa0 !=
                   (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                    *)0x0) &&
                 (iVar36 = *(int *)(local_aa0 + 8), *(int *)(local_aa0 + 8) = iVar36 + -1,
                 iVar36 + -1 == 0)) {
                (**(code **)(*(long *)local_aa0 + 8))();
              }
              if ((local_c90 != (Point_2 *)0x0) &&
                 (iVar36 = *(int *)(local_c90 + 8), *(int *)(local_c90 + 8) = iVar36 + -1,
                 iVar36 + -1 == 0)) {
                (**(code **)(*(long *)local_c90 + 8))();
              }
              uVar59 = uVar59 + 1;
              pPVar89 = pPStack_cc8 + -(long)local_cd0;
              if ((ulong)((long)pPVar89 >> 3) <= uVar59) break;
              if (uVar59 != 0) {
                    /* try { // try from 00402d64 to 00402d67 has its CatchHandler @ 004055e8 */
                CGAL::
                Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_x_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                              *)(local_cd0 + lVar77),pPVar89);
                    /* try { // try from 00402d6c to 00402d7f has its CatchHandler @ 004055f8 */
                CGAL::
                Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                ::To_double::operator()((To_double *)&local_c90,extraout_x1_03);
                CGAL::
                Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                ::operator()((Lazy_construction_nt<CGAL::Epeck,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<CGAL::Interval_nt<false>>>,CGAL::CartesianKernelFunctors::Compute_y_2<CGAL::Simple_cartesian<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>>
                              *)(local_cd0 + lVar77),extraout_x1_04);
                    /* try { // try from 00402d84 to 00402d87 has its CatchHandler @ 00405220 */
                CGAL::
                Real_embeddable_traits<CGAL::Lazy_exact_nt<boost::multiprecision::number<boost::multiprecision::backends::gmp_rational,(boost::multiprecision::expression_template_option)1>>>
                ::To_double::operator()((To_double *)&local_aa0,extraout_x1_05);
                pPVar89 = extraout_x1_06;
                if (local_aa0 !=
                    (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)0x0) {
                  uVar34 = *(int *)(local_aa0 + 8) - 1;
                  pPVar89 = (Point_2 *)(ulong)uVar34;
                  *(uint *)(local_aa0 + 8) = uVar34;
                  if (uVar34 == 0) {
                    (**(code **)(*(long *)local_aa0 + 8))();
                    pPVar89 = extraout_x1_07;
                  }
                }
                if (local_c90 != (Point_2 *)0x0) {
                  uVar34 = *(int *)(local_c90 + 8) - 1;
                  pPVar89 = (Point_2 *)(ulong)uVar34;
                  *(uint *)(local_c90 + 8) = uVar34;
                  if (uVar34 == 0) {
                    (**(code **)(*(long *)local_c90 + 8))();
                    pPVar89 = extraout_x1_08;
                  }
                }
              }
            }
          }
          if (local_cb0 != (long *)0x0) {
            ::operator_delete(local_cb0);
          }
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
          ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                  &local_cd0);
          this_00 = (_Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                     *)local_b10;
          pvVar56 = pvStack_b08;
          pvVar10 = pvStack_b08;
          if ((local_e30 != (long *)0x0) &&
             (iVar36 = (int)local_e30[1] + -1, *(int *)(local_e30 + 1) = iVar36, iVar36 == 0)) {
            (**(code **)(*local_e30 + 8))();
            this_00 = (_Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                       *)local_b10;
            pvVar56 = pvStack_b08;
            pvVar10 = pvStack_b08;
          }
          for (; pvVar28 = pvStack_b08,
              this_00 !=
              (_Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
               *)pvStack_b08; this_00 = this_00 + 0x30) {
            pvVar44 = *(void **)(this_00 + 0x10);
            pvStack_b08 = pvVar10;
            while (pvVar44 != (void *)0x0) {
              std::
              _Rb_tree<int,std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::_Select1st<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>,std::less<int>,std::allocator<std::pair<int_const,std::__cxx11::list<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
              ::_M_erase(this_00,*(_Rb_tree_node **)((long)pvVar44 + 0x18));
              pvVar88 = *(void **)((long)pvVar44 + 0x10);
              puVar104 = *(void **)((long)pvVar44 + 0x28);
              while ((void *)((long)pvVar44 + 0x28) != puVar104) {
                pvVar95 = (void *)*puVar104;
                pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                           *)puVar104[2];
                if ((pvVar40 !=
                     (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                      *)0x0) &&
                   (iVar36 = *(int *)(pvVar40 + 8), *(int *)(pvVar40 + 8) = iVar36 + -1,
                   iVar36 + -1 == 0)) {
                  (**(code **)(*(long *)pvVar40 + 8))();
                }
                ::operator_delete(puVar104);
                puVar104 = pvVar95;
              }
              ::operator_delete(pvVar44);
              pvVar44 = pvVar88;
            }
            pvVar56 = local_b10;
            pvVar10 = pvStack_b08;
            pvStack_b08 = pvVar28;
          }
          pvVar54 = local_cf0;
          pvVar72 = local_ce8;
          pvVar17 = local_ce8;
          pvStack_b08 = pvVar10;
          if (pvVar56 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            ::operator_delete(pvVar56);
            pvVar54 = local_cf0;
            pvVar72 = local_ce8;
            pvVar17 = local_ce8;
          }
          for (; pvVar25 = local_ce8, pvVar54 != local_ce8; pvVar54 = pvVar54 + 0x18) {
            local_ce8 = pvVar17;
            std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
            ~vector(pvVar54);
            pvVar72 = local_cf0;
            pvVar17 = local_ce8;
            local_ce8 = pvVar25;
          }
          local_ce8 = pvVar17;
          if (pvVar72 !=
              (vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)0x0)
          {
            ::operator_delete(pvVar72);
          }
          std::__cxx11::stringstream::~stringstream(asStack_990);
          if (local_bd0 != (void *)0x0) {
            puVar104 = (undefined8 *)(local_b88 + 8);
            for (puVar45 = local_ba8; puVar45 < puVar104; puVar45 = puVar45 + 1) {
              pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                         *)*puVar45;
              ::operator_delete(pvVar40);
            }
            ::operator_delete(local_bd0);
          }
          pLVar46 = local_c48;
          pLVar18 = local_c40;
          pLVar19 = local_c40;
          if ((local_e38 != (long *)0x0) &&
             (iVar36 = (int)local_e38[1] + -1, *(int *)(local_e38 + 1) = iVar36, iVar36 == 0)) {
            (**(code **)(*local_e38 + 8))();
            pLVar46 = local_c48;
            pLVar18 = local_c40;
            pLVar19 = local_c40;
          }
          for (; pLVar26 = local_c40, pLVar46 != local_c40; pLVar46 = pLVar46 + 0x60) {
            pvVar40 = *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                        **)(pLVar46 + 8);
            local_c40 = pLVar19;
            if (pvVar40 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              lVar77 = *(long *)(pLVar46 + 0x50);
              puVar104 = *(undefined8 **)(pLVar46 + 0x30);
              if (*(undefined8 **)(pLVar46 + 0x30) < (undefined8 *)(lVar77 + 8U)) {
                do {
                  puVar45 = puVar104 + 1;
                  ::operator_delete((void *)*puVar104);
                  puVar104 = puVar45;
                } while (puVar45 < (undefined8 *)(lVar77 + 8U));
                pvVar40 = *(vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                            **)(pLVar46 + 8);
              }
              ::operator_delete(pvVar40);
            }
            pLVar18 = local_c48;
            pLVar19 = local_c40;
            local_c40 = pLVar26;
          }
          local_c40 = pLVar19;
          if (pLVar18 != (Lazy_exact_nt *)0x0) {
            ::operator_delete(pLVar18);
          }
          if ((local_e40 != (long *)0x0) &&
             (iVar36 = (int)local_e40[1] + -1, *(int *)(local_e40 + 1) = iVar36, iVar36 == 0)) {
            (**(code **)(*local_e40 + 8))();
          }
          std::
          vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
          ::~vector((vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                     *)&local_d10);
          std::
          deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
          ::~deque((deque<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                    *)&local_b60);
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
          ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                  &local_b80);
          std::
          vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
          ::~vector((vector<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,std::allocator<CGAL::Polygon_2<CGAL::Epeck,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>>>
                     *)&local_d30);
          std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::
          ~vector((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                  &local_bf0);
          std::
          vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
          ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)&local_d50);
          if (local_c60 != (int *)0x0) {
            ::operator_delete(local_c60);
          }
          if (local_c78 != (Point_ *)0x0) {
            ::operator_delete(local_c78);
          }
          ::operator_delete(__s);
          std::
          vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
          ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)&local_d70);
          std::
          vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
          ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                     *)&local_d90);
        }
      }
      else {
        paVar63 = aaStack_c18;
                    /* try { // try from 003ffc74 to 003ffc9b has its CatchHandler @ 0040586c */
        CGAL::
        orientation_2<__gnu_cxx::__normal_iterator<CGAL::Point_2<CGAL::Epeck>const*,std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>>,CGAL::Epeck>
                  (local_c30,uStack_c28);
        if (uVar34 == 0) {
          if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
            rcutils_logging_initialize();
          }
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003ffca4 to 003ffca7 has its CatchHandler @ 00405a44 */
          rclcpp::get_logger((string *)local_408);
          uVar41 = 0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            uVar41 = *(undefined8 *)local_aa0;
          }
                    /* try { // try from 003ffcb8 to 003ffcbb has its CatchHandler @ 00405974 */
          cVar31 = rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
          if (cVar31 != '\0') {
            std::__cxx11::string::string<std::allocator<char>>
                      ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401f70 to 00401f73 has its CatchHandler @ 00404c18 */
            rclcpp::get_logger((string *)local_408);
            uVar41 = 0;
            if (local_aa0 !=
                (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                 *)0x0) {
              uVar41 = *(undefined8 *)local_aa0;
            }
                    /* try { // try from 00401f98 to 00401f9b has its CatchHandler @ 00404bec */
            rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                        ::__rcutils_logging_location,0x1e,uVar41,&DAT_0046a610);
            if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
              std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
            }
            if (local_408[0] != auStack_3f8) {
              ::operator_delete(local_408[0]);
            }
          }
          goto LAB_003ffce8;
        }
                    /* try { // try from 004035a0 to 0040369b has its CatchHandler @ 0040586c */
        if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
           (rcutils_logging_initialize(), uVar34 != 0)) {
          fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:268] error initializing logging: "
                 ,1,0x65,*(FILE **)PTR_stderr_004deec0);
          rcutils_get_error_string(local_808);
          rcutils_get_error_string((string *)local_408);
          sVar58 = strlen((char *)local_408);
          fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
          paVar63 = (allocator *)0x1;
          fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
          rcutils_reset_error();
        }
                    /* try { // try from 00401ce0 to 00401ce3 has its CatchHandler @ 0040586c */
        std::__cxx11::string::string<std::allocator<char>>
                  ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401cec to 00401cef has its CatchHandler @ 00405a74 */
        rclcpp::get_logger((string *)local_408);
        uVar41 = 0;
        if (local_aa0 !=
            (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
             *)0x0) {
          uVar41 = *(undefined8 *)local_aa0;
        }
                    /* try { // try from 00401d00 to 00401d03 has its CatchHandler @ 00405a70 */
        pvVar40 = (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
                   *)rcutils_logging_logger_is_enabled_for(uVar41,0x1e);
        if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
          std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
        }
        if (local_408[0] != auStack_3f8) {
          ::operator_delete(local_408[0]);
        }
        if (((ulong)pvVar40 & 0xff) != 0) {
                    /* try { // try from 00401d3c to 00401d3f has its CatchHandler @ 0040586c */
          std::__cxx11::string::string<std::allocator<char>>
                    ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00401d48 to 00401d4b has its CatchHandler @ 00405a68 */
          rclcpp::get_logger((string *)local_408);
          paVar63 = (allocator *)0x0;
          if (local_aa0 !=
              (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
               *)0x0) {
            paVar63 = *(allocator **)local_aa0;
          }
                    /* try { // try from 00401d70 to 00401d73 has its CatchHandler @ 00405a8c */
          rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                      ::__rcutils_logging_location,0x1e,paVar63,
                      "Remove cnt index because of  no clockwise_oriented");
LAB_00401d74:
          if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
            std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
          }
          if (local_408[0] != auStack_3f8) {
            ::operator_delete(local_408[0]);
          }
        }
      }
      if (local_db0 != (int *)0x0) {
        ::operator_delete(local_db0);
      }
      local_f70 = local_f70 + 1;
      std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::~vector
                ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                 &local_c10);
      std::vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>>::~vector
                ((vector<CGAL::Point_2<CGAL::Epeck>,std::allocator<CGAL::Point_2<CGAL::Epeck>>> *)
                 &local_c30);
    } while (piVar76 != local_f70);
  }
  if (*(long *)(param_7 + 0x28) == 0) {
    if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
      rcutils_logging_initialize();
    }
                    /* try { // try from 003ffefc to 003ffeff has its CatchHandler @ 00405a7c */
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 003fff08 to 003fff0b has its CatchHandler @ 00404da0 */
    rclcpp::get_logger((string *)local_408);
    uVar38 = 0;
    if (local_aa0 !=
        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
         *)0x0) {
      uVar38 = *(undefined8 *)local_aa0;
    }
                    /* try { // try from 003fff1c to 003fff1f has its CatchHandler @ 00404d9c */
    cVar32 = rcutils_logging_logger_is_enabled_for(uVar38,0x1e);
    if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
    cVar31 = '\0';
    if (cVar32 != '\0') {
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004039bc to 004039bf has its CatchHandler @ 00404f9c */
      rclcpp::get_logger((string *)local_408);
      uVar38 = 0;
      if (local_aa0 !=
          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
           *)0x0) {
        uVar38 = *(undefined8 *)local_aa0;
      }
                    /* try { // try from 004039e4 to 004039e7 has its CatchHandler @ 004048cc */
      rcutils_log(getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                  ::__rcutils_logging_location,0x1e,uVar38,"No path find!!!");
      if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
      cVar31 = '\0';
    }
  }
  else {
                    /* try { // try from 00403ac0 to 00403aeb has its CatchHandler @ 00405a7c */
    pathAssessFunction(this,param_7,DAT_00453380,DAT_00453388,DAT_00453390);
    cVar39 = clock();
                    /* try { // try from 00404584 to 004045ff has its CatchHandler @ 00405a7c */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (rcutils_logging_initialize(), (int)cVar39 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:678] error initializing logging: "
             ,1,0x65,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(local_808);
      rcutils_get_error_string((string *)local_408);
      sVar58 = strlen((char *)local_408);
      fwrite(local_808,1,sVar58,*(FILE **)PTR_stderr_004deec0);
      paVar63 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 00403af4 to 00403af7 has its CatchHandler @ 00404f54 */
    rclcpp::get_logger((string *)local_408);
    uVar38 = 0;
    if (local_aa0 !=
        (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
         *)0x0) {
      uVar38 = *(undefined8 *)local_aa0;
    }
                    /* try { // try from 00403b08 to 00403b0b has its CatchHandler @ 00404f5c */
    cVar31 = rcutils_logging_logger_is_enabled_for(uVar38,0x14);
    if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
    if (cVar31 == '\0') {
      cVar31 = '\x01';
    }
    else {
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar63);
                    /* try { // try from 004040ac to 004040af has its CatchHandler @ 00404fe8 */
      rclcpp::get_logger((string *)local_408);
      uVar38 = 0;
      if (local_aa0 !=
          (vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
           *)0x0) {
        uVar38 = *(undefined8 *)local_aa0;
      }
                    /* try { // try from 004040f0 to 004040f3 has its CatchHandler @ 00404fe4 */
      rcutils_log((double)(cVar39 - cVar37) / 1000000.0,
                  getPlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                  ::__rcutils_logging_location,0x14,uVar38,"------4 - Total planning cost: %.2f");
      if (local_a98 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_a98);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
    }
  }
LAB_003fff4c:
  if (local_dd0 != (int *)0x0) {
    ::operator_delete(local_dd0);
  }
  if (local_df0 != (void *)0x0) {
    ::operator_delete(local_df0);
  }
  std::
  vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
  ::~vector((vector<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>,std::allocator<std::vector<cv::Point_<int>,std::allocator<cv::Point_<int>>>>>
             *)&local_e10);
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(PTR___stack_chk_guard_004de1a8,
                     local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return cVar31;
}



// ===== coverage_plan::BsdTspPlanner::makePlan @ 00405a98 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::BsdTspPlanner::makePlan(int, int, cv::Mat const&, bool, unsigned char,
   std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

undefined1 __thiscall
coverage_plan::BsdTspPlanner::makePlan
          (BsdTspPlanner *this,int param_1,int param_2,Mat *param_3,bool param_4,uchar param_5,
          map *param_6)

{
  int *piVar1;
  bool bVar2;
  undefined *puVar3;
  char cVar4;
  undefined1 uVar5;
  int iVar6;
  int iVar7;
  undefined8 uVar8;
  int *piVar9;
  size_t __n;
  long lVar10;
  allocator *paVar11;
  allocator *paVar12;
  undefined8 *local_820;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_818;
  undefined1 auStack_810 [1024];
  undefined8 local_410;
  undefined8 uStack_408;
  undefined8 local_400;
  undefined8 uStack_3f8;
  undefined8 local_3f0;
  undefined8 uStack_3e8;
  undefined8 local_3e0;
  long lStack_3d8;
  undefined8 *local_3d0;
  undefined8 *local_3c8;
  undefined8 local_3c0;
  undefined8 uStack_3b8;
  long local_8;
  
  paVar11 = (allocator *)(ulong)(uint)param_2;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  paVar12 = paVar11;
  if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
    iVar6 = rcutils_logging_initialize();
    puVar3 = PTR_stderr_004deec0;
    if (iVar6 != 0) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:77] error initializing logging: "
             ,1,100,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_810);
      rcutils_get_error_string(&local_410);
      __n = strlen((char *)&local_410);
      fwrite(auStack_810,1,__n,*(FILE **)puVar3);
      paVar12 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)puVar3);
      rcutils_reset_error();
    }
  }
  std::__cxx11::string::string<std::allocator<char>>
            ((string *)&local_410,"coverage_planner_server",paVar12);
                    /* try { // try from 00405b20 to 00405b23 has its CatchHandler @ 00405e3c */
  rclcpp::get_logger((string *)&local_410);
  uVar8 = 0;
  if (local_820 != (undefined8 *)0x0) {
    uVar8 = *local_820;
  }
                    /* try { // try from 00405b34 to 00405b37 has its CatchHandler @ 00405e0c */
  cVar4 = rcutils_logging_logger_is_enabled_for(uVar8,0x14);
  if (local_818 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_818);
  }
  if (local_410 != &local_400) {
    ::operator_delete(local_410);
  }
  if (cVar4 != '\0') {
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)&local_410,"coverage_planner_server",paVar12);
                    /* try { // try from 00405d1c to 00405d1f has its CatchHandler @ 00405f28 */
    rclcpp::get_logger((string *)&local_410);
    uVar8 = 0;
    if (local_820 != (undefined8 *)0x0) {
      uVar8 = *local_820;
    }
                    /* try { // try from 00405d50 to 00405d53 has its CatchHandler @ 00405f24 */
    rcutils_log(makePlan(int,int,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                ::__rcutils_logging_location,0x14,uVar8,
                "Start x,y: %d   %d specify_direction: %d cov_direction: %d",param_1,paVar11,param_4
                ,param_5);
    if (local_818 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_818);
    }
    if (local_410 != &local_400) {
      ::operator_delete(local_410);
    }
  }
  piVar9 = ::operator_new(0x10);
  piVar9[0] = 0;
  piVar9[1] = -1;
  piVar9[2] = 1;
  piVar9[3] = 2;
                    /* try { // try from 00405ba0 to 00405ba3 has its CatchHandler @ 00405e44 */
  iVar6 = CoveragePlannerInterface::obstacle_erode_value((CoveragePlannerInterface *)this);
  iVar6 = iVar6 + *piVar9 * 2;
  local_3d0 = &uStack_408;
  local_3c8 = &local_3c0;
  uStack_3f8 = 0;
  local_400 = 0;
  if (iVar6 < 0) {
    iVar6 = 0;
  }
  uStack_408 = _UNK_00454ad8;
  local_410 = (undefined8 *)_DAT_00454ad0;
  uStack_3e8 = 0;
  local_3f0 = 0;
  lStack_3d8 = 0;
  local_3e0 = 0;
  uStack_3b8 = 0;
  local_3c0 = 0;
                    /* try { // try from 00405be4 to 00405c47 has its CatchHandler @ 00405f30 */
  iVar7 = CoveragePlannerInterface::obstacle_morph_open_value((CoveragePlannerInterface *)this);
  cVar4 = CoveragePlannerInterface::preprocessMap
                    ((CoveragePlannerInterface *)this,param_3,(Mat *)&local_410,iVar6,iVar7);
  if ((cVar4 == '\0') ||
     (cVar4 = CoveragePlannerInterface::isStartValid
                        ((CoveragePlannerInterface *)this,param_1,param_2,(Mat *)&local_410),
     cVar4 == '\0')) {
    uVar5 = 0;
  }
  else {
    uVar5 = getPlan(this,param_1,param_2,param_3,(Mat *)&local_410,param_4,param_5,param_6);
  }
  if (lStack_3d8 != 0) {
    piVar1 = (int *)(lStack_3d8 + 0x14);
    do {
      iVar6 = *piVar1;
      cVar4 = '\x01';
      bVar2 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar2) {
        *piVar1 = iVar6 + -1;
        cVar4 = ExclusiveMonitorsStatus();
      }
    } while (cVar4 != '\0');
    if (iVar6 == 1) {
      cv::Mat::deallocate();
    }
  }
  lStack_3d8 = 0;
  uStack_3f8 = 0;
  local_400 = 0;
  uStack_3e8 = 0;
  local_3f0 = 0;
  if (0 < local_410._4_4_) {
    lVar10 = 0;
    do {
      *(undefined4 *)((long)local_3d0 + lVar10 * 4) = 0;
      lVar10 = lVar10 + 1;
    } while ((int)lVar10 < local_410._4_4_);
  }
  if (local_3c8 != &local_3c0) {
    cv::fastFree(local_3c8);
  }
  ::operator_delete(piVar9);
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 != 0) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
  }
  return uVar5;
}



// ===== coverage_plan::BsdTspPlanner::makePlan @ 00406048 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::BsdTspPlanner::makePlan(int, int, cv::Mat const&, cv::Mat const&, bool, unsigned
   char, std::map<int, std::vector<coverage_plan::StatusGridPos,
   std::allocator<coverage_plan::StatusGridPos> >, std::less<int>, std::allocator<std::pair<int
   const, std::vector<coverage_plan::StatusGridPos, std::allocator<coverage_plan::StatusGridPos> > >
   > >*) */

char __thiscall
coverage_plan::BsdTspPlanner::makePlan
          (BsdTspPlanner *this,int param_1,int param_2,Mat *param_3,Mat *param_4,bool param_5,
          uchar param_6,map *param_7)

{
  int *piVar1;
  bool bVar2;
  undefined *puVar3;
  char cVar4;
  int iVar5;
  undefined8 uVar6;
  long lVar7;
  void *pvVar8;
  size_t sVar9;
  allocator *paVar10;
  allocator *paVar11;
  void *pvVar12;
  char local_910;
  void *local_8f0;
  undefined8 *local_8e0;
  _Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *local_8d8;
  undefined8 local_8d0;
  undefined8 uStack_8c8;
  undefined8 local_8c0;
  undefined8 uStack_8b8;
  undefined8 local_8b0;
  undefined8 uStack_8a8;
  undefined8 uStack_8a0;
  long local_898;
  undefined8 *local_890;
  undefined8 *local_888;
  undefined8 local_880;
  undefined8 uStack_878;
  undefined8 local_870;
  undefined8 uStack_868;
  undefined8 uStack_860;
  undefined8 uStack_858;
  undefined8 local_850;
  undefined8 uStack_848;
  undefined8 uStack_840;
  undefined8 uStack_838;
  allocator *local_830;
  undefined8 *puStack_828;
  undefined8 local_820;
  undefined8 uStack_818;
  undefined1 auStack_808 [1024];
  undefined1 *local_408 [2];
  undefined1 auStack_3f8 [1008];
  long local_8;
  
  paVar10 = (allocator *)(ulong)(uint)param_2;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  paVar11 = paVar10;
  if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
    iVar5 = rcutils_logging_initialize();
    puVar3 = PTR_stderr_004deec0;
    if (iVar5 != 0) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:109] error initializing logging: "
             ,1,0x65,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_808);
      rcutils_get_error_string(local_408);
      sVar9 = strlen((char *)local_408);
      fwrite(auStack_808,1,sVar9,*(FILE **)puVar3);
      paVar11 = (allocator *)0x1;
      fwrite("\n",1,1,*(FILE **)puVar3);
      rcutils_reset_error();
    }
  }
  std::__cxx11::string::string<std::allocator<char>>
            ((string *)local_408,"coverage_planner_server",paVar11);
                    /* try { // try from 004060d4 to 004060d7 has its CatchHandler @ 004068d4 */
  rclcpp::get_logger((string *)local_408);
  uVar6 = 0;
  if (local_8e0 != (undefined8 *)0x0) {
    uVar6 = *local_8e0;
  }
                    /* try { // try from 004060e8 to 004060eb has its CatchHandler @ 004068e4 */
  cVar4 = rcutils_logging_logger_is_enabled_for(uVar6,0x14);
  if (local_8d8 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
    std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_8d8);
  }
  if (local_408[0] != auStack_3f8) {
    ::operator_delete(local_408[0]);
  }
  if (cVar4 != '\0') {
    std::__cxx11::string::string<std::allocator<char>>
              ((string *)local_408,"coverage_planner_server",paVar11);
                    /* try { // try from 00406130 to 00406133 has its CatchHandler @ 004068dc */
    rclcpp::get_logger((string *)local_408);
    uVar6 = 0;
    if (local_8e0 != (undefined8 *)0x0) {
      uVar6 = *local_8e0;
    }
                    /* try { // try from 00406160 to 00406163 has its CatchHandler @ 00406780 */
    rcutils_log(makePlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                ::__rcutils_logging_location,0x14,uVar6,"Start x,y: %d   %d",param_1,paVar10);
    if (local_8d8 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
      std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_8d8);
    }
    if (local_408[0] != auStack_3f8) {
      ::operator_delete(local_408[0]);
    }
  }
  local_890 = &uStack_8c8;
  local_888 = &local_880;
  uStack_8c8 = _UNK_00454ad8;
  local_8d0 = _DAT_00454ad0;
  uStack_8b8 = 0;
  local_8c0 = 0;
  uStack_8a8 = 0;
  local_8b0 = 0;
  local_898 = 0;
  uStack_8a0 = 0;
  uStack_878 = 0;
  local_880 = 0;
                    /* try { // try from 004061bc to 004061bf has its CatchHandler @ 004065cc */
  cVar4 = CoveragePlannerInterface::preprocessMap
                    ((CoveragePlannerInterface *)this,param_3,param_4,(Mat *)&local_8d0);
                    /* try { // try from 00406284 to 004062b3 has its CatchHandler @ 004065cc */
  if ((cVar4 == '\0') ||
     (cVar4 = CoveragePlannerInterface::isStartValid
                        ((CoveragePlannerInterface *)this,param_1,param_2,(Mat *)&local_8d0),
     cVar4 == '\0')) {
    local_910 = '\0';
  }
  else {
    local_910 = getPlan(this,param_1,param_2,param_3,(Mat *)&local_8d0,param_5,param_6,param_7);
    if (local_910 == '\0') {
      puStack_828 = &local_820;
      paVar11 = (allocator *)&uStack_868;
      uStack_868 = _UNK_00454ad8;
      local_870 = _DAT_00454ad0;
      uStack_858 = 0;
      uStack_860 = 0;
      uStack_848 = 0;
      local_850 = 0;
      uStack_838 = 0;
      uStack_840 = 0;
      uStack_818 = 0;
      local_820 = 0;
      local_830 = paVar11;
      if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
         (iVar5 = rcutils_logging_initialize(), iVar5 != 0)) {
        fwrite("[rcutils|/root/novabot/src/coverage_planner/src/bsd_tsp_planner.cpp:118] error initializing logging: "
               ,1,0x65,*(FILE **)PTR_stderr_004deec0);
        rcutils_get_error_string(auStack_808);
        rcutils_get_error_string((string *)local_408);
        sVar9 = strlen((char *)local_408);
        fwrite(auStack_808,1,sVar9,*(FILE **)PTR_stderr_004deec0);
        paVar11 = (allocator *)0x1;
        fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
        rcutils_reset_error();
      }
                    /* try { // try from 00406308 to 0040630b has its CatchHandler @ 004068bc */
      std::__cxx11::string::string<std::allocator<char>>
                ((string *)local_408,"coverage_planner_server",paVar11);
                    /* try { // try from 00406314 to 00406317 has its CatchHandler @ 00406938 */
      rclcpp::get_logger((string *)local_408);
      uVar6 = 0;
      if (local_8e0 != (undefined8 *)0x0) {
        uVar6 = *local_8e0;
      }
                    /* try { // try from 00406328 to 0040632b has its CatchHandler @ 00406934 */
      cVar4 = rcutils_logging_logger_is_enabled_for(uVar6,0x1e);
      if (local_8d8 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
        std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_8d8);
      }
      if (local_408[0] != auStack_3f8) {
        ::operator_delete(local_408[0]);
      }
      if (cVar4 != '\0') {
                    /* try { // try from 00406364 to 00406367 has its CatchHandler @ 004068bc */
        std::__cxx11::string::string<std::allocator<char>>
                  ((string *)local_408,"coverage_planner_server",paVar11);
                    /* try { // try from 00406370 to 00406373 has its CatchHandler @ 00406928 */
        rclcpp::get_logger((string *)local_408);
        uVar6 = 0;
        if (local_8e0 != (undefined8 *)0x0) {
          uVar6 = *local_8e0;
        }
                    /* try { // try from 00406398 to 0040639b has its CatchHandler @ 004068e8 */
        rcutils_log(makePlan(int,int,cv::Mat_const&,cv::Mat_const&,bool,unsigned_char,std::map<int,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>*)
                    ::__rcutils_logging_location,0x1e,uVar6,"No valid path, retry again!!!");
        if (local_8d8 != (_Sp_counted_base<(__gnu_cxx::_Lock_policy)2> *)0x0) {
          std::_Sp_counted_base<(__gnu_cxx::_Lock_policy)2>::_M_release(local_8d8);
        }
        if (local_408[0] != auStack_3f8) {
          ::operator_delete(local_408[0]);
        }
      }
      pvVar12 = *(void **)(param_7 + 0x10);
      if (pvVar12 != (void *)0x0) {
        std::
        _Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
        ::_M_erase((_Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
                    *)param_7,*(_Rb_tree_node **)((long)pvVar12 + 0x18));
        pvVar8 = *(void **)((long)pvVar12 + 0x28);
        local_8f0 = *(void **)((long)pvVar12 + 0x10);
        if (pvVar8 == (void *)0x0) goto LAB_00406418;
        do {
          ::operator_delete(pvVar8);
          ::operator_delete(pvVar12);
          pvVar12 = local_8f0;
          while( true ) {
            if (pvVar12 == (void *)0x0) goto LAB_00406428;
            std::
            _Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
            ::_M_erase((_Rb_tree<int,std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>,std::_Select1st<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>,std::less<int>,std::allocator<std::pair<int_const,std::vector<coverage_plan::StatusGridPos,std::allocator<coverage_plan::StatusGridPos>>>>>
                        *)param_7,*(_Rb_tree_node **)((long)pvVar12 + 0x18));
            pvVar8 = *(void **)((long)pvVar12 + 0x28);
            local_8f0 = *(void **)((long)pvVar12 + 0x10);
            if (pvVar8 != (void *)0x0) break;
LAB_00406418:
            ::operator_delete(pvVar12);
            pvVar12 = local_8f0;
          }
        } while( true );
      }
LAB_00406428:
      *(undefined8 *)(param_7 + 0x10) = 0;
      *(map **)(param_7 + 0x18) = param_7 + 8;
      *(map **)(param_7 + 0x20) = param_7 + 8;
      *(undefined8 *)(param_7 + 0x28) = 0;
                    /* try { // try from 0040644c to 0040646b has its CatchHandler @ 004068bc */
      cVar4 = CoveragePlannerInterface::preprocessMapReduceInflation
                        ((CoveragePlannerInterface *)this,param_3,param_4,(Mat *)&local_870);
      if ((cVar4 != '\0') &&
         (cVar4 = CoveragePlannerInterface::isStartValid
                            ((CoveragePlannerInterface *)this,param_1,param_2,(Mat *)&local_870),
         cVar4 != '\0')) {
                    /* try { // try from 00406528 to 004065c3 has its CatchHandler @ 004068bc */
        local_910 = getPlan(this,param_1,param_2,param_3,(Mat *)&local_870,param_5,param_6,param_7);
      }
      cv::Mat::~Mat((Mat *)&local_870);
    }
  }
  if (local_898 != 0) {
    piVar1 = (int *)(local_898 + 0x14);
    do {
      iVar5 = *piVar1;
      cVar4 = '\x01';
      bVar2 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar2) {
        *piVar1 = iVar5 + -1;
        cVar4 = ExclusiveMonitorsStatus();
      }
    } while (cVar4 != '\0');
    if (iVar5 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_898 = 0;
  uStack_8b8 = 0;
  local_8c0 = 0;
  uStack_8a8 = 0;
  local_8b0 = 0;
  if (0 < local_8d0._4_4_) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_890 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_8d0._4_4_);
  }
  if (local_888 != &local_880) {
    cv::fastFree(local_888);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return local_910;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== pointToLineMinGridDis @ 00445618 =====

/* pointToLineMinGridDis(int, int, int, int, int, int) */

float pointToLineMinGridDis(int param_1,int param_2,int param_3,int param_4,int param_5,int param_6)

{
  int iVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  float fVar5;
  float fVar6;
  
  iVar2 = param_3 - param_1;
  iVar1 = -iVar2;
  if (-1 < iVar2) {
    iVar1 = iVar2;
  }
  iVar3 = param_4 - param_2;
  iVar4 = -iVar3;
  if (-1 < iVar3) {
    iVar4 = iVar3;
  }
  if (iVar1 < iVar4) {
    iVar1 = iVar4;
  }
  if (iVar1 != 0) {
    iVar4 = 0;
    fVar6 = 1e+07;
    do {
      fVar5 = (float)iVar4;
      iVar4 = iVar4 + 1;
      fVar5 = hypotf(((float)param_1 + fVar5 * ((float)iVar2 / (float)iVar1)) - (float)param_5,
                     ((float)param_2 + fVar5 * ((float)iVar3 / (float)iVar1)) - (float)param_6);
      if (fVar5 < fVar6) {
        fVar6 = fVar5;
      }
    } while (iVar4 != iVar1);
    return fVar6;
  }
  return 1e+07;
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMap @ 0044c438 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::CoveragePlannerInterface::preprocessMap(cv::Mat const&, cv::Mat*, int, int) */

CoveragePlannerInterface __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMap
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,int param_3,int param_4)

{
  string *psVar1;
  int *piVar2;
  char cVar3;
  bool bVar4;
  undefined8 *puVar5;
  undefined *puVar6;
  string *psVar7;
  char cVar8;
  int iVar9;
  undefined8 uVar10;
  clock_t cVar11;
  long lVar12;
  clock_t cVar13;
  size_t sVar14;
  CoveragePlannerInterface CVar15;
  undefined8 local_8c0;
  undefined4 local_8b8 [2];
  Mat *local_8b0;
  undefined8 uStack_8a8;
  int local_8a0 [2];
  Mat *local_898;
  undefined8 local_890;
  undefined8 *local_888;
  string *local_880;
  undefined8 local_878;
  string asStack_870 [4];
  int local_86c;
  undefined8 local_860;
  undefined8 uStack_858;
  undefined8 uStack_850;
  undefined8 uStack_848;
  long local_838;
  long local_830;
  undefined1 *local_828;
  undefined1 auStack_820 [16];
  undefined8 *local_810;
  undefined8 uStack_808;
  undefined8 *puStack_800;
  undefined8 uStack_7f8;
  undefined8 local_410;
  undefined8 *puStack_408;
  undefined8 *local_400;
  undefined8 uStack_3f8;
  undefined8 local_3f0;
  undefined8 uStack_3e8;
  long local_3d8;
  long local_3d0;
  undefined1 *local_3c8;
  undefined1 auStack_3c0 [952];
  long local_8;
  
  CVar15 = this[8];
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  if (CVar15 == (CoveragePlannerInterface)0x0) {
    if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
      iVar9 = rcutils_logging_initialize();
      puVar6 = PTR_stderr_004deec0;
      if (iVar9 != 0) {
        fwrite("[rcutils|/root/novabot/src/coverage_planner/src/coverage_planner_interface.cpp:84] error initializing logging: "
               ,1,0x6f,*(FILE **)PTR_stderr_004deec0);
        rcutils_get_error_string(&local_810);
        rcutils_get_error_string(&local_410);
        sVar14 = strlen((char *)&local_410);
        fwrite(&local_810,1,sVar14,*(FILE **)puVar6);
        fwrite("\n",1,1,*(FILE **)puVar6);
        rcutils_reset_error();
      }
    }
    local_410 = &local_400;
    local_888 = (undefined8 *)&DAT_00000017;
    local_410 = (undefined8 **)
                std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
    local_400 = local_888;
    puVar5 = (undefined8 *)
             CONCAT17(s_coverage_planner_server_00453458[0xf],
                      s_coverage_planner_server_00453458._8_7_);
    *local_410 = (undefined8 *)s_coverage_planner_server_00453458._0_8_;
    local_410[1] = puVar5;
    *(ulong *)((long)local_410 + 0xf) =
         CONCAT71(s_coverage_planner_server_00453458._16_7_,s_coverage_planner_server_00453458[0xf])
    ;
    puStack_408 = local_888;
    *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044c4e4 to 0044c4e7 has its CatchHandler @ 0044ce00 */
    rclcpp::get_logger((string *)&local_410);
    uVar10 = 0;
    if (local_888 != (undefined8 *)0x0) {
      uVar10 = *local_888;
    }
                    /* try { // try from 0044c4f8 to 0044c4fb has its CatchHandler @ 0044cd9c */
    cVar8 = rcutils_logging_logger_is_enabled_for(uVar10,0x1e);
    psVar7 = local_880;
    if (local_880 != (string *)0x0) {
      if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
        iVar9 = *(int *)(local_880 + 8);
        *(int *)(local_880 + 8) = iVar9 + -1;
      }
      else {
        psVar1 = local_880 + 8;
        do {
          iVar9 = *(int *)psVar1;
          cVar3 = '\x01';
          bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
          if (bVar4) {
            *(int *)psVar1 = iVar9 + -1;
            cVar3 = ExclusiveMonitorsStatus();
          }
        } while (cVar3 != '\0');
      }
      if (iVar9 == 1) {
        (**(code **)(*(long *)local_880 + 0x10))(local_880);
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)(psVar7 + 0xc);
          *(int *)(psVar7 + 0xc) = iVar9 + -1;
        }
        else {
          psVar1 = psVar7 + 0xc;
          do {
            iVar9 = *(int *)psVar1;
            cVar3 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
            if (bVar4) {
              *(int *)psVar1 = iVar9 + -1;
              cVar3 = ExclusiveMonitorsStatus();
            }
          } while (cVar3 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*(long *)psVar7 + 0x18))(psVar7);
        }
      }
    }
    if (local_410 != &local_400) {
      ::operator_delete(local_410);
    }
    CVar15 = (CoveragePlannerInterface)0x0;
    if (cVar8 != '\0') {
      local_410 = &local_400;
      local_888 = (undefined8 *)&DAT_00000017;
      local_410 = (undefined8 **)
                  std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
      local_400 = local_888;
      puVar5 = (undefined8 *)
               CONCAT17(s_coverage_planner_server_00453458[0xf],
                        s_coverage_planner_server_00453458._8_7_);
      *local_410 = (undefined8 *)s_coverage_planner_server_00453458._0_8_;
      local_410[1] = puVar5;
      *(ulong *)((long)local_410 + 0xf) =
           CONCAT71(s_coverage_planner_server_00453458._16_7_,
                    s_coverage_planner_server_00453458[0xf]);
      puStack_408 = local_888;
      *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044c5dc to 0044c5df has its CatchHandler @ 0044ce14 */
      rclcpp::get_logger((string *)&local_410);
      uVar10 = 0;
      if (local_888 != (undefined8 *)0x0) {
        uVar10 = *local_888;
      }
                    /* try { // try from 0044c604 to 0044c607 has its CatchHandler @ 0044ce10 */
      rcutils_log(preprocessMap(cv::Mat_const&,cv::Mat*,int,int)::__rcutils_logging_location,0x1e,
                  uVar10,"Robot params is Unset, please call setCoverageParam to set params!!!");
      psVar7 = local_880;
      if (local_880 != (string *)0x0) {
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)(local_880 + 8);
          *(int *)(local_880 + 8) = iVar9 + -1;
        }
        else {
          psVar1 = local_880 + 8;
          do {
            iVar9 = *(int *)psVar1;
            cVar8 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
            if (bVar4) {
              *(int *)psVar1 = iVar9 + -1;
              cVar8 = ExclusiveMonitorsStatus();
            }
          } while (cVar8 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*(long *)local_880 + 0x10))(local_880);
          if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
            iVar9 = *(int *)(psVar7 + 0xc);
            *(int *)(psVar7 + 0xc) = iVar9 + -1;
          }
          else {
            psVar1 = psVar7 + 0xc;
            do {
              iVar9 = *(int *)psVar1;
              cVar8 = '\x01';
              bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
              if (bVar4) {
                *(int *)psVar1 = iVar9 + -1;
                cVar8 = ExclusiveMonitorsStatus();
              }
            } while (cVar8 != '\0');
          }
          if (iVar9 == 1) {
            (**(code **)(*(long *)psVar7 + 0x18))(psVar7);
          }
        }
      }
      if (local_410 != &local_400) {
        ::operator_delete(local_410);
      }
      CVar15 = (CoveragePlannerInterface)0x0;
    }
  }
  else {
    cVar11 = clock();
    local_8a0[0] = 0x1010000;
    local_890 = 0;
    local_888 = (undefined8 *)CONCAT44(local_888._4_4_,0x2010000);
    local_878 = 0;
    local_898 = param_1;
    local_880 = (string *)param_2;
    cv::threshold((_InputArray *)local_8a0,(_OutputArray *)&local_888,(double)(byte)this[0x30],255.0
                  ,0);
    local_888 = (undefined8 *)0xffffffffffffffff;
    local_8a0[0] = param_3;
    local_8a0[1] = param_3;
    cv::getStructuringElement(asStack_870,2,(_InputArray *)local_8a0,(_OutputArray *)&local_888);
    local_8c0 = 0xffffffffffffffff;
    local_8b8[0] = 0x1010000;
    uStack_8a8 = 0;
    local_8a0[0] = 0x2010000;
    local_890 = 0;
    local_888 = (undefined8 *)CONCAT44(local_888._4_4_,0x1010000);
    local_878 = 0;
    puStack_408 = (undefined8 *)_UNK_00454ae8;
    local_410 = (undefined8 **)_DAT_00454ae0;
    uStack_3f8 = _UNK_00454ae8;
    local_400 = _DAT_00454ae0;
    local_8b0 = param_2;
    local_898 = param_2;
    local_880 = asStack_870;
                    /* try { // try from 0044c758 to 0044c787 has its CatchHandler @ 0044cdf8 */
    cv::morphologyEx(local_8b8,(_InputArray *)local_8a0,0,(_OutputArray *)&local_888,&local_8c0,1,0,
                     (string *)&local_410);
    if (0 < param_4) {
      local_8a0[0] = 3;
      local_8a0[1] = 3;
      local_888 = (undefined8 *)0xffffffffffffffff;
      cv::getStructuringElement
                ((string *)&local_410,2,(_InputArray *)local_8a0,(_OutputArray *)&local_888);
      local_8c0 = 0xffffffffffffffff;
      local_8b8[0] = 0x1010000;
      uStack_8a8 = 0;
      local_8a0[0] = 0x2010000;
      local_890 = 0;
      local_888 = (undefined8 *)CONCAT44(local_888._4_4_,0x1010000);
      local_878 = 0;
      uStack_808 = _UNK_00454ae8;
      local_810 = _DAT_00454ae0;
      uStack_7f8 = _UNK_00454ae8;
      puStack_800 = _DAT_00454ae0;
      local_8b0 = param_2;
      local_898 = param_2;
      local_880 = (string *)&local_410;
                    /* try { // try from 0044c7dc to 0044c7df has its CatchHandler @ 0044cde8 */
      cv::morphologyEx(local_8b8,(_InputArray *)local_8a0,2,(_OutputArray *)&local_888,&local_8c0,2,
                       0,&local_810);
      if (local_3d8 != 0) {
        piVar2 = (int *)(local_3d8 + 0x14);
        do {
          iVar9 = *piVar2;
          cVar8 = '\x01';
          bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
          if (bVar4) {
            *piVar2 = iVar9 + -1;
            cVar8 = ExclusiveMonitorsStatus();
          }
        } while (cVar8 != '\0');
        if (iVar9 == 1) {
          cv::Mat::deallocate();
        }
      }
      local_3d8 = 0;
      uStack_3f8 = 0;
      local_400 = (undefined8 *)0x0;
      uStack_3e8 = 0;
      local_3f0 = 0;
      if (0 < local_410._4_4_) {
        lVar12 = 0;
        do {
          *(undefined4 *)(local_3d0 + lVar12 * 4) = 0;
          lVar12 = lVar12 + 1;
        } while ((int)lVar12 < local_410._4_4_);
      }
      if (local_3c8 != auStack_3c0) {
        cv::fastFree(local_3c8);
      }
    }
    cVar13 = clock();
                    /* try { // try from 0044ccac to 0044cd27 has its CatchHandler @ 0044cdf8 */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (iVar9 = rcutils_logging_initialize(), iVar9 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/coverage_planner_interface.cpp:105] error initializing logging: "
             ,1,0x70,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(&local_810);
      rcutils_get_error_string((string *)&local_410);
      sVar14 = strlen((char *)&local_410);
      fwrite(&local_810,1,sVar14,*(FILE **)PTR_stderr_004deec0);
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
    local_410 = &local_400;
    local_888 = (undefined8 *)&DAT_00000017;
                    /* try { // try from 0044c884 to 0044c887 has its CatchHandler @ 0044cdf8 */
    local_410 = (undefined8 **)
                std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
    local_400 = local_888;
    puVar5 = (undefined8 *)
             CONCAT17(s_coverage_planner_server_00453458[0xf],
                      s_coverage_planner_server_00453458._8_7_);
    *local_410 = (undefined8 *)s_coverage_planner_server_00453458._0_8_;
    local_410[1] = puVar5;
    *(ulong *)((long)local_410 + 0xf) =
         CONCAT71(s_coverage_planner_server_00453458._16_7_,s_coverage_planner_server_00453458[0xf])
    ;
    puStack_408 = local_888;
    *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044c8c8 to 0044c8cb has its CatchHandler @ 0044ce08 */
    rclcpp::get_logger((string *)&local_410);
    uVar10 = 0;
    if (local_888 != (undefined8 *)0x0) {
      uVar10 = *local_888;
    }
                    /* try { // try from 0044c8dc to 0044c8df has its CatchHandler @ 0044cd68 */
    cVar8 = rcutils_logging_logger_is_enabled_for(uVar10,0x14);
    psVar7 = local_880;
    if (local_880 != (string *)0x0) {
      if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
        iVar9 = *(int *)(local_880 + 8);
        *(int *)(local_880 + 8) = iVar9 + -1;
      }
      else {
        psVar1 = local_880 + 8;
        do {
          iVar9 = *(int *)psVar1;
          cVar3 = '\x01';
          bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
          if (bVar4) {
            *(int *)psVar1 = iVar9 + -1;
            cVar3 = ExclusiveMonitorsStatus();
          }
        } while (cVar3 != '\0');
      }
      if (iVar9 == 1) {
        (**(code **)(*(long *)local_880 + 0x10))(local_880);
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)(psVar7 + 0xc);
          *(int *)(psVar7 + 0xc) = iVar9 + -1;
        }
        else {
          psVar1 = psVar7 + 0xc;
          do {
            iVar9 = *(int *)psVar1;
            cVar3 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
            if (bVar4) {
              *(int *)psVar1 = iVar9 + -1;
              cVar3 = ExclusiveMonitorsStatus();
            }
          } while (cVar3 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*(long *)psVar7 + 0x18))(psVar7);
        }
      }
    }
    if (local_410 != &local_400) {
      ::operator_delete(local_410);
    }
    if (cVar8 != '\0') {
      local_410 = &local_400;
      local_888 = (undefined8 *)&DAT_00000017;
                    /* try { // try from 0044c98c to 0044c98f has its CatchHandler @ 0044cdf8 */
      local_410 = (undefined8 **)
                  std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
      local_400 = local_888;
      puVar5 = (undefined8 *)
               CONCAT17(s_coverage_planner_server_00453458[0xf],
                        s_coverage_planner_server_00453458._8_7_);
      *local_410 = (undefined8 *)s_coverage_planner_server_00453458._0_8_;
      local_410[1] = puVar5;
      *(ulong *)((long)local_410 + 0xf) =
           CONCAT71(s_coverage_planner_server_00453458._16_7_,
                    s_coverage_planner_server_00453458[0xf]);
      puStack_408 = local_888;
      *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044c9c8 to 0044c9cb has its CatchHandler @ 0044cde0 */
      rclcpp::get_logger((string *)&local_410);
      uVar10 = 0;
      if (local_888 != (undefined8 *)0x0) {
        uVar10 = *local_888;
      }
                    /* try { // try from 0044ca0c to 0044ca0f has its CatchHandler @ 0044cddc */
      rcutils_log((double)(cVar13 - cVar11) / 1000000.0,
                  preprocessMap(cv::Mat_const&,cv::Mat*,int,int)::__rcutils_logging_location,0x14,
                  uVar10,"Preprocess time cost: %.4f");
      psVar7 = local_880;
      if (local_880 != (string *)0x0) {
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)(local_880 + 8);
          *(int *)(local_880 + 8) = iVar9 + -1;
        }
        else {
          psVar1 = local_880 + 8;
          do {
            iVar9 = *(int *)psVar1;
            cVar8 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
            if (bVar4) {
              *(int *)psVar1 = iVar9 + -1;
              cVar8 = ExclusiveMonitorsStatus();
            }
          } while (cVar8 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*(long *)local_880 + 0x10))(local_880);
          if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
            iVar9 = *(int *)(psVar7 + 0xc);
            *(int *)(psVar7 + 0xc) = iVar9 + -1;
          }
          else {
            psVar1 = psVar7 + 0xc;
            do {
              iVar9 = *(int *)psVar1;
              cVar8 = '\x01';
              bVar4 = (bool)ExclusiveMonitorPass(psVar1,0x10);
              if (bVar4) {
                *(int *)psVar1 = iVar9 + -1;
                cVar8 = ExclusiveMonitorsStatus();
              }
            } while (cVar8 != '\0');
          }
          if (iVar9 == 1) {
            (**(code **)(*(long *)psVar7 + 0x18))(psVar7);
          }
        }
      }
      if (local_410 != &local_400) {
        ::operator_delete(local_410);
      }
    }
    if (local_838 != 0) {
      piVar2 = (int *)(local_838 + 0x14);
      do {
        iVar9 = *piVar2;
        cVar8 = '\x01';
        bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
        if (bVar4) {
          *piVar2 = iVar9 + -1;
          cVar8 = ExclusiveMonitorsStatus();
        }
      } while (cVar8 != '\0');
      if (iVar9 == 1) {
        cv::Mat::deallocate();
      }
    }
    local_838 = 0;
    uStack_858 = 0;
    local_860 = 0;
    uStack_848 = 0;
    uStack_850 = 0;
    if (0 < local_86c) {
      lVar12 = 0;
      do {
        *(undefined4 *)(local_830 + lVar12 * 4) = 0;
        lVar12 = lVar12 + 1;
      } while ((int)lVar12 < local_86c);
    }
    if (local_828 != auStack_820) {
      cv::fastFree(local_828);
    }
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return CVar15;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMap @ 0044ce20 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::CoveragePlannerInterface::preprocessMap(cv::Mat const&, cv::Mat const&, cv::Mat*)
    */

char __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMap
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,Mat *param_3)

{
  int *piVar1;
  int iVar2;
  char cVar3;
  bool bVar4;
  char cVar5;
  _InputArray *p_Var6;
  long lVar7;
  undefined4 local_b8 [2];
  Mat *local_b0;
  undefined8 local_a8;
  undefined4 local_a0 [2];
  Mat *local_98;
  undefined8 local_90;
  undefined4 local_88 [2];
  Mat *local_80;
  undefined8 local_78;
  undefined8 local_70;
  undefined8 uStack_68;
  undefined8 local_60;
  undefined8 uStack_58;
  undefined8 local_50;
  undefined8 uStack_48;
  undefined8 uStack_40;
  long local_38;
  undefined8 *local_30;
  undefined8 *local_28;
  undefined8 local_20;
  undefined8 uStack_18;
  long local_8;
  
  local_30 = &uStack_68;
  local_28 = &local_20;
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  uStack_68 = _UNK_00454ad8;
  local_70 = _DAT_00454ad0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  local_38 = 0;
  uStack_40 = 0;
  uStack_18 = 0;
  local_20 = 0;
                    /* try { // try from 0044ce84 to 0044ce87 has its CatchHandler @ 0044cfa4 */
  cVar5 = preprocessMap(this,param_1,param_3,*(int *)(this + 0x18),*(int *)(this + 0x1c));
  if (cVar5 != '\0') {
                    /* try { // try from 0044cf40 to 0044cf8f has its CatchHandler @ 0044cfa4 */
    cVar5 = preprocessMap(this,param_1,(Mat *)&local_70,*(int *)(this + 0x20),*(int *)(this + 0x24))
    ;
    if (cVar5 != '\0') {
      local_b8[0] = 0x1010000;
      local_a8 = 0;
      local_a0[0] = 0x1010000;
      local_90 = 0;
      local_88[0] = 0x2010000;
      local_78 = 0;
      local_b0 = param_3;
      local_98 = (Mat *)&local_70;
      local_80 = param_3;
      p_Var6 = (_InputArray *)cv::noArray();
      cv::bitwise_and((_InputArray *)local_b8,(_InputArray *)local_a0,(_OutputArray *)local_88,
                      p_Var6);
      goto LAB_0044ce94;
    }
  }
  cVar5 = '\0';
LAB_0044ce94:
  if (local_38 != 0) {
    piVar1 = (int *)(local_38 + 0x14);
    do {
      iVar2 = *piVar1;
      cVar3 = '\x01';
      bVar4 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar4) {
        *piVar1 = iVar2 + -1;
        cVar3 = ExclusiveMonitorsStatus();
      }
    } while (cVar3 != '\0');
    if (iVar2 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_38 = 0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  if (0 < local_70._4_4_) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_30 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_70._4_4_);
  }
  if (local_28 != &local_20) {
    cv::fastFree(local_28);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return cVar5;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMapReduceInflation @ 0044cfc0 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::CoveragePlannerInterface::preprocessMapReduceInflation(cv::Mat const&, cv::Mat
   const&, cv::Mat*) */

char __thiscall
coverage_plan::CoveragePlannerInterface::preprocessMapReduceInflation
          (CoveragePlannerInterface *this,Mat *param_1,Mat *param_2,Mat *param_3)

{
  int *piVar1;
  char cVar2;
  bool bVar3;
  int iVar4;
  char cVar5;
  _InputArray *p_Var6;
  long lVar7;
  undefined4 local_b8 [2];
  Mat *local_b0;
  undefined8 local_a8;
  undefined4 local_a0 [2];
  Mat *local_98;
  undefined8 local_90;
  undefined4 local_88 [2];
  Mat *local_80;
  undefined8 local_78;
  undefined8 local_70;
  undefined8 uStack_68;
  undefined8 local_60;
  undefined8 uStack_58;
  undefined8 local_50;
  undefined8 uStack_48;
  undefined8 uStack_40;
  long local_38;
  undefined8 *local_30;
  undefined8 *local_28;
  undefined8 local_20;
  undefined8 uStack_18;
  long local_8;
  
  iVar4 = *(int *)(this + 0x18) + -2;
  local_30 = &uStack_68;
  local_28 = &local_20;
  if (iVar4 < 1) {
    iVar4 = 1;
  }
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  uStack_68 = _UNK_00454ad8;
  local_70 = _DAT_00454ad0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  local_38 = 0;
  uStack_40 = 0;
  uStack_18 = 0;
  local_20 = 0;
                    /* try { // try from 0044d030 to 0044d033 has its CatchHandler @ 0044d154 */
  cVar5 = preprocessMap(this,param_1,param_3,iVar4,*(int *)(this + 0x1c));
  if (cVar5 != '\0') {
                    /* try { // try from 0044d0f0 to 0044d13f has its CatchHandler @ 0044d154 */
    cVar5 = preprocessMap(this,param_1,(Mat *)&local_70,*(int *)(this + 0x20),*(int *)(this + 0x24))
    ;
    if (cVar5 != '\0') {
      local_b8[0] = 0x1010000;
      local_a8 = 0;
      local_a0[0] = 0x1010000;
      local_90 = 0;
      local_88[0] = 0x2010000;
      local_78 = 0;
      local_b0 = param_3;
      local_98 = (Mat *)&local_70;
      local_80 = param_3;
      p_Var6 = (_InputArray *)cv::noArray();
      cv::bitwise_and((_InputArray *)local_b8,(_InputArray *)local_a0,(_OutputArray *)local_88,
                      p_Var6);
      goto LAB_0044d040;
    }
  }
  cVar5 = '\0';
LAB_0044d040:
  if (local_38 != 0) {
    piVar1 = (int *)(local_38 + 0x14);
    do {
      iVar4 = *piVar1;
      cVar2 = '\x01';
      bVar3 = (bool)ExclusiveMonitorPass(piVar1,0x10);
      if (bVar3) {
        *piVar1 = iVar4 + -1;
        cVar2 = ExclusiveMonitorsStatus();
      }
    } while (cVar2 != '\0');
    if (iVar4 == 1) {
      cv::Mat::deallocate();
    }
  }
  local_38 = 0;
  uStack_58 = 0;
  local_60 = 0;
  uStack_48 = 0;
  local_50 = 0;
  if (0 < local_70._4_4_) {
    lVar7 = 0;
    do {
      *(undefined4 *)((long)local_30 + lVar7 * 4) = 0;
      lVar7 = lVar7 + 1;
    } while ((int)lVar7 < local_70._4_4_);
  }
  if (local_28 != &local_20) {
    cv::fastFree(local_28);
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return cVar5;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



// ===== coverage_plan::CoveragePlannerInterface::preprocessMapRect @ 0044d170 =====

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* coverage_plan::CoveragePlannerInterface::preprocessMapRect(cv::Mat const&, cv::Mat*, int, int) */

Mat coverage_plan::CoveragePlannerInterface::preprocessMapRect
              (Mat *param_1,Mat *param_2,int param_3,int param_4)

{
  long *plVar1;
  int *piVar2;
  char cVar3;
  bool bVar4;
  undefined8 **ppuVar5;
  undefined *puVar6;
  long *plVar7;
  char cVar8;
  int iVar9;
  undefined8 *puVar10;
  clock_t cVar11;
  clock_t cVar12;
  size_t sVar13;
  long lVar14;
  ulong uVar15;
  Mat MVar16;
  undefined8 local_8c0;
  undefined4 local_8b8 [2];
  ulong local_8b0;
  undefined8 uStack_8a8;
  int local_8a0;
  int iStack_89c;
  Mat *local_898;
  undefined8 local_890;
  char *local_888;
  long *local_880;
  undefined8 local_878;
  undefined8 local_870;
  undefined8 local_860;
  undefined8 uStack_858;
  undefined8 uStack_850;
  undefined8 uStack_848;
  long local_838;
  long local_830;
  undefined1 *local_828;
  undefined1 auStack_820 [16];
  undefined1 auStack_810 [1024];
  char **local_410;
  char *pcStack_408;
  undefined8 **local_400;
  undefined8 uStack_3f8;
  long local_8;
  
  uVar15 = (ulong)(uint)param_3;
  MVar16 = param_1[8];
  local_8 = *(long *)PTR___stack_chk_guard_004de1a8;
  if (MVar16 == (Mat)0x0) {
    if (*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') {
      iVar9 = rcutils_logging_initialize();
      puVar6 = PTR_stderr_004deec0;
      if (iVar9 != 0) {
        fwrite("[rcutils|/root/novabot/src/coverage_planner/src/coverage_planner_interface.cpp:116] error initializing logging: "
               ,1,0x70,*(FILE **)PTR_stderr_004deec0);
        rcutils_get_error_string(auStack_810);
        rcutils_get_error_string(&local_410);
        sVar13 = strlen((char *)&local_410);
        fwrite(auStack_810,1,sVar13,*(FILE **)puVar6);
        fwrite("\n",1,1,*(FILE **)puVar6);
        rcutils_reset_error();
      }
    }
    local_410 = (char **)&local_400;
    local_888 = &DAT_00000017;
    local_410 = (char **)std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
    local_400 = (undefined8 **)local_888;
    ppuVar5 = (undefined8 **)
              CONCAT17(s_coverage_planner_server_00453458[0xf],
                       s_coverage_planner_server_00453458._8_7_);
    *local_410 = (char *)s_coverage_planner_server_00453458._0_8_;
    local_410[1] = (char *)ppuVar5;
    *(ulong *)((long)local_410 + 0xf) =
         CONCAT71(s_coverage_planner_server_00453458._16_7_,s_coverage_planner_server_00453458[0xf])
    ;
    pcStack_408 = local_888;
    *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044d21c to 0044d21f has its CatchHandler @ 0044da10 */
    rclcpp::get_logger((string *)&local_410);
    puVar10 = (undefined8 *)0x0;
    if ((undefined8 **)local_888 != (undefined8 **)0x0) {
      puVar10 = *(undefined8 **)local_888;
    }
                    /* try { // try from 0044d230 to 0044d233 has its CatchHandler @ 0044da28 */
    cVar8 = rcutils_logging_logger_is_enabled_for(puVar10,0x1e);
    plVar7 = local_880;
    if (local_880 != (long *)0x0) {
      if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
        iVar9 = (int)local_880[1];
        *(int *)(local_880 + 1) = iVar9 + -1;
      }
      else {
        plVar1 = local_880 + 1;
        do {
          iVar9 = (int)*plVar1;
          cVar3 = '\x01';
          bVar4 = (bool)ExclusiveMonitorPass(plVar1,0x10);
          if (bVar4) {
            *(int *)plVar1 = iVar9 + -1;
            cVar3 = ExclusiveMonitorsStatus();
          }
        } while (cVar3 != '\0');
      }
      if (iVar9 == 1) {
        (**(code **)(*local_880 + 0x10))(local_880);
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)((long)plVar7 + 0xc);
          *(int *)((long)plVar7 + 0xc) = iVar9 + -1;
        }
        else {
          piVar2 = (int *)((long)plVar7 + 0xc);
          do {
            iVar9 = *piVar2;
            cVar3 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
            if (bVar4) {
              *piVar2 = iVar9 + -1;
              cVar3 = ExclusiveMonitorsStatus();
            }
          } while (cVar3 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*plVar7 + 0x18))(plVar7);
        }
      }
    }
    if ((undefined8 ***)local_410 != &local_400) {
      ::operator_delete(local_410);
    }
    MVar16 = (Mat)0x0;
    if (cVar8 != '\0') {
      local_410 = (char **)&local_400;
      local_888 = &DAT_00000017;
      local_410 = (char **)std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
      local_400 = (undefined8 **)local_888;
      ppuVar5 = (undefined8 **)
                CONCAT17(s_coverage_planner_server_00453458[0xf],
                         s_coverage_planner_server_00453458._8_7_);
      *local_410 = (char *)s_coverage_planner_server_00453458._0_8_;
      local_410[1] = (char *)ppuVar5;
      *(ulong *)((long)local_410 + 0xf) =
           CONCAT71(s_coverage_planner_server_00453458._16_7_,
                    s_coverage_planner_server_00453458[0xf]);
      pcStack_408 = local_888;
      *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044d314 to 0044d317 has its CatchHandler @ 0044d9cc */
      rclcpp::get_logger((string *)&local_410);
      puVar10 = (undefined8 *)0x0;
      if ((undefined8 **)local_888 != (undefined8 **)0x0) {
        puVar10 = *(undefined8 **)local_888;
      }
                    /* try { // try from 0044d33c to 0044d33f has its CatchHandler @ 0044d9f8 */
      rcutils_log(preprocessMapRect(cv::Mat_const&,cv::Mat*,int,int)::__rcutils_logging_location,
                  0x1e,puVar10,
                  "Robot params is Unset, please call setCoverageParam to set params!!!");
      plVar7 = local_880;
      if (local_880 != (long *)0x0) {
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = (int)local_880[1];
          *(int *)(local_880 + 1) = iVar9 + -1;
        }
        else {
          plVar1 = local_880 + 1;
          do {
            iVar9 = (int)*plVar1;
            cVar8 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(plVar1,0x10);
            if (bVar4) {
              *(int *)plVar1 = iVar9 + -1;
              cVar8 = ExclusiveMonitorsStatus();
            }
          } while (cVar8 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*local_880 + 0x10))(local_880);
          if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
            iVar9 = *(int *)((long)plVar7 + 0xc);
            *(int *)((long)plVar7 + 0xc) = iVar9 + -1;
          }
          else {
            piVar2 = (int *)((long)plVar7 + 0xc);
            do {
              iVar9 = *piVar2;
              cVar8 = '\x01';
              bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
              if (bVar4) {
                *piVar2 = iVar9 + -1;
                cVar8 = ExclusiveMonitorsStatus();
              }
            } while (cVar8 != '\0');
          }
          if (iVar9 == 1) {
            (**(code **)(*plVar7 + 0x18))(plVar7);
          }
        }
      }
      if ((undefined8 ***)local_410 != &local_400) {
        ::operator_delete(local_410);
      }
      MVar16 = (Mat)0x0;
    }
  }
  else {
    cVar11 = clock();
    _local_8a0 = CONCAT44(iStack_89c,0x1010000);
    local_890 = 0;
    local_888 = (char *)CONCAT44(local_888._4_4_,0x2010000);
    local_878 = 0;
    local_898 = param_2;
    local_880 = (long *)uVar15;
    cv::threshold((_InputArray *)&local_8a0,(_OutputArray *)&local_888,(double)(byte)param_1[0x30],
                  255.0,0);
    local_888 = (char *)0xffffffffffffffff;
    local_8a0 = param_4;
    iStack_89c = param_4;
    cv::getStructuringElement(&local_870,0,(_InputArray *)&local_8a0,(_OutputArray *)&local_888);
    local_8c0 = 0xffffffffffffffff;
    local_8b8[0] = 0x1010000;
    uStack_8a8 = 0;
    _local_8a0 = CONCAT44(iStack_89c,0x2010000);
    local_890 = 0;
    local_888 = (char *)CONCAT44(local_888._4_4_,0x1010000);
    local_878 = 0;
    pcStack_408 = (char *)_UNK_00454ae8;
    local_410 = _DAT_00454ae0;
    uStack_3f8 = _UNK_00454ae8;
    local_400 = (undefined8 **)_DAT_00454ae0;
    local_8b0 = uVar15;
    local_898 = (Mat *)uVar15;
    local_880 = &local_870;
                    /* try { // try from 0044d47c to 0044d4b7 has its CatchHandler @ 0044d98c */
    cv::morphologyEx(local_8b8,(_InputArray *)&local_8a0,0,(_OutputArray *)&local_888,&local_8c0,1,0
                     ,(string *)&local_410);
    cVar12 = clock();
                    /* try { // try from 0044d8dc to 0044d957 has its CatchHandler @ 0044d98c */
    if ((*PTR_g_rcutils_logging_initialized_004ddfe0 == '\0') &&
       (iVar9 = rcutils_logging_initialize(), iVar9 != 0)) {
      fwrite("[rcutils|/root/novabot/src/coverage_planner/src/coverage_planner_interface.cpp:129] error initializing logging: "
             ,1,0x70,*(FILE **)PTR_stderr_004deec0);
      rcutils_get_error_string(auStack_810);
      rcutils_get_error_string((string *)&local_410);
      sVar13 = strlen((char *)&local_410);
      fwrite(auStack_810,1,sVar13,*(FILE **)PTR_stderr_004deec0);
      fwrite("\n",1,1,*(FILE **)PTR_stderr_004deec0);
      rcutils_reset_error();
    }
    local_410 = (char **)&local_400;
    local_888 = &DAT_00000017;
    local_410 = (char **)std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
    local_400 = (undefined8 **)local_888;
    ppuVar5 = (undefined8 **)
              CONCAT17(s_coverage_planner_server_00453458[0xf],
                       s_coverage_planner_server_00453458._8_7_);
    *local_410 = (char *)s_coverage_planner_server_00453458._0_8_;
    local_410[1] = (char *)ppuVar5;
    *(ulong *)((long)local_410 + 0xf) =
         CONCAT71(s_coverage_planner_server_00453458._16_7_,s_coverage_planner_server_00453458[0xf])
    ;
    pcStack_408 = local_888;
    *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044d4f8 to 0044d4fb has its CatchHandler @ 0044da18 */
    rclcpp::get_logger((string *)&local_410);
    puVar10 = (undefined8 *)0x0;
    if ((undefined8 **)local_888 != (undefined8 **)0x0) {
      puVar10 = *(undefined8 **)local_888;
    }
                    /* try { // try from 0044d50c to 0044d50f has its CatchHandler @ 0044d9f4 */
    cVar8 = rcutils_logging_logger_is_enabled_for(puVar10,0x14);
    plVar7 = local_880;
    if (local_880 != (long *)0x0) {
      if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
        iVar9 = (int)local_880[1];
        *(int *)(local_880 + 1) = iVar9 + -1;
      }
      else {
        plVar1 = local_880 + 1;
        do {
          iVar9 = (int)*plVar1;
          cVar3 = '\x01';
          bVar4 = (bool)ExclusiveMonitorPass(plVar1,0x10);
          if (bVar4) {
            *(int *)plVar1 = iVar9 + -1;
            cVar3 = ExclusiveMonitorsStatus();
          }
        } while (cVar3 != '\0');
      }
      if (iVar9 == 1) {
        (**(code **)(*local_880 + 0x10))(local_880);
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = *(int *)((long)plVar7 + 0xc);
          *(int *)((long)plVar7 + 0xc) = iVar9 + -1;
        }
        else {
          piVar2 = (int *)((long)plVar7 + 0xc);
          do {
            iVar9 = *piVar2;
            cVar3 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
            if (bVar4) {
              *piVar2 = iVar9 + -1;
              cVar3 = ExclusiveMonitorsStatus();
            }
          } while (cVar3 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*plVar7 + 0x18))(plVar7);
        }
      }
    }
    if ((undefined8 ***)local_410 != &local_400) {
      ::operator_delete(local_410);
    }
    if (cVar8 != '\0') {
      local_410 = (char **)&local_400;
      local_888 = &DAT_00000017;
                    /* try { // try from 0044d5c4 to 0044d5c7 has its CatchHandler @ 0044d98c */
      local_410 = (char **)std::__cxx11::string::_M_create((ulong *)&local_410,(ulong)&local_888);
      local_400 = (undefined8 **)local_888;
      ppuVar5 = (undefined8 **)
                CONCAT17(s_coverage_planner_server_00453458[0xf],
                         s_coverage_planner_server_00453458._8_7_);
      *local_410 = (char *)s_coverage_planner_server_00453458._0_8_;
      local_410[1] = (char *)ppuVar5;
      *(ulong *)((long)local_410 + 0xf) =
           CONCAT71(s_coverage_planner_server_00453458._16_7_,
                    s_coverage_planner_server_00453458[0xf]);
      pcStack_408 = local_888;
      *(char *)((long)local_410 + (long)local_888) = '\0';
                    /* try { // try from 0044d600 to 0044d603 has its CatchHandler @ 0044da20 */
      rclcpp::get_logger((string *)&local_410);
      puVar10 = (undefined8 *)0x0;
      if ((undefined8 **)local_888 != (undefined8 **)0x0) {
        puVar10 = *(undefined8 **)local_888;
      }
                    /* try { // try from 0044d640 to 0044d643 has its CatchHandler @ 0044d994 */
      rcutils_log((double)(cVar12 - cVar11) / 1000000.0,
                  preprocessMapRect(cv::Mat_const&,cv::Mat*,int,int)::__rcutils_logging_location,
                  0x14,puVar10,"Preprocess time cost: %.4f");
      plVar7 = local_880;
      if (local_880 != (long *)0x0) {
        if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
          iVar9 = (int)local_880[1];
          *(int *)(local_880 + 1) = iVar9 + -1;
        }
        else {
          plVar1 = local_880 + 1;
          do {
            iVar9 = (int)*plVar1;
            cVar8 = '\x01';
            bVar4 = (bool)ExclusiveMonitorPass(plVar1,0x10);
            if (bVar4) {
              *(int *)plVar1 = iVar9 + -1;
              cVar8 = ExclusiveMonitorsStatus();
            }
          } while (cVar8 != '\0');
        }
        if (iVar9 == 1) {
          (**(code **)(*local_880 + 0x10))(local_880);
          if (PTR___pthread_key_create_004de620 == (undefined *)0x0) {
            iVar9 = *(int *)((long)plVar7 + 0xc);
            *(int *)((long)plVar7 + 0xc) = iVar9 + -1;
          }
          else {
            piVar2 = (int *)((long)plVar7 + 0xc);
            do {
              iVar9 = *piVar2;
              cVar8 = '\x01';
              bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
              if (bVar4) {
                *piVar2 = iVar9 + -1;
                cVar8 = ExclusiveMonitorsStatus();
              }
            } while (cVar8 != '\0');
          }
          if (iVar9 == 1) {
            (**(code **)(*plVar7 + 0x18))(plVar7);
          }
        }
      }
      if ((undefined8 ***)local_410 != &local_400) {
        ::operator_delete(local_410);
      }
    }
    if (local_838 != 0) {
      piVar2 = (int *)(local_838 + 0x14);
      do {
        iVar9 = *piVar2;
        cVar8 = '\x01';
        bVar4 = (bool)ExclusiveMonitorPass(piVar2,0x10);
        if (bVar4) {
          *piVar2 = iVar9 + -1;
          cVar8 = ExclusiveMonitorsStatus();
        }
      } while (cVar8 != '\0');
      if (iVar9 == 1) {
        cv::Mat::deallocate();
      }
    }
    local_838 = 0;
    uStack_858 = 0;
    local_860 = 0;
    uStack_848 = 0;
    uStack_850 = 0;
    if (0 < local_870._4_4_) {
      lVar14 = 0;
      do {
        *(undefined4 *)(local_830 + lVar14 * 4) = 0;
        lVar14 = lVar14 + 1;
      } while ((int)lVar14 < local_870._4_4_);
    }
    if (local_828 != auStack_820) {
      cv::fastFree(local_828);
    }
  }
  if (local_8 - *(long *)PTR___stack_chk_guard_004de1a8 == 0) {
    return MVar16;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail(local_8 - *(long *)PTR___stack_chk_guard_004de1a8,0);
}



