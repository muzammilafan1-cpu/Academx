import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AdminStudentsAttendanceScreen extends StatefulWidget {
  final String institutionId;

  const AdminStudentsAttendanceScreen({
    super.key,
    required this.institutionId,
  });

  @override
  State<AdminStudentsAttendanceScreen> createState() =>
      _AdminStudentsAttendanceScreenState();
}

class _AdminStudentsAttendanceScreenState
    extends State<AdminStudentsAttendanceScreen> {

  String selectedFilter = "month";

  /// 🔹 FETCH ALL STUDENTS
  Future<List<QueryDocumentSnapshot>> fetchStudents() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(widget.institutionId)
        .collection('users')
        .where('role', isEqualTo: 'student')
        .get();

    return snapshot.docs;
  }

  /// 🔹 FETCH ALL ATTENDANCE
  Future<QuerySnapshot> fetchAttendance() async {
    return await FirebaseFirestore.instance
        .collection('attendance_v2')
        .where(
      'institutionId',
      isEqualTo: widget.institutionId,
    )
        .get();
  }

  /// 🔹 CALCULATE ATTENDANCE
  Map<String, Map<String, int>> calculateStats(
      List<QueryDocumentSnapshot> docs,
      ) {

    Map<String, Map<String, int>> stats = {};

    for (var doc in docs) {

      final data =
      doc.data() as Map<String, dynamic>;

      final studentsMap =
      data['students']
      as Map<String, dynamic>?;

      if (studentsMap == null) continue;

      studentsMap.forEach((
          studentId,
          isPresent,
          ) {

        stats.putIfAbsent(studentId, () => {
          'present': 0,
          'total': 0,
        });

        final student = stats[studentId]!;

        student['total'] =
            (student['total'] ?? 0) + 1;

        if (isPresent == true) {
          student['present'] =
              (student['present'] ?? 0) + 1;
        }
      });
    }

    return stats;
  }

  double getPercentage(
      int present,
      int total,
      ) {

    if (total == 0) return 0;

    return (present / total) * 100;
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      backgroundColor: Colors.white,

      body: SafeArea(
        child: Column(
          crossAxisAlignment:
          CrossAxisAlignment.start,
          children: [

            /// 🔹 HEADER
            Padding(
              padding:
              const EdgeInsets.fromLTRB(
                20,
                20,
                20,
                0,
              ),

              child: Column(
                crossAxisAlignment:
                CrossAxisAlignment.start,
                children: [

                  const Text(
                    "Student Attendance",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight:
                      FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),

                  const SizedBox(height: 16),

                  const Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),

                  /// 🔹 FILTER TABS
                  Row(
                    children: [

                      _buildFilterTab(
                        title: "This Month",
                        value: "month",
                      ),

                      const SizedBox(width: 10),

                      _buildFilterTab(
                        title: "All Time",
                        value: "all",
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  const Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),

                  /// 🔹 CLASS + SECTION
                  Row(
                    children: [

                      Expanded(
                        child: Container(
                          padding:
                          const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),

                          decoration: BoxDecoration(
                            color:
                            const Color(
                              0xFFF8F8F8,
                            ),

                            borderRadius:
                            BorderRadius.circular(
                              14,
                            ),
                          ),

                          child: const Row(
                            mainAxisAlignment:
                            MainAxisAlignment
                                .spaceBetween,
                            children: [

                              Text(
                                "Class",
                                style: TextStyle(
                                  fontWeight:
                                  FontWeight.w500,
                                ),
                              ),

                              Icon(
                                Icons.keyboard_arrow_down,
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(width: 12),

                      Expanded(
                        child: Container(
                          padding:
                          const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),

                          decoration: BoxDecoration(
                            color:
                            const Color(
                              0xFFF8F8F8,
                            ),

                            borderRadius:
                            BorderRadius.circular(
                              14,
                            ),
                          ),

                          child: const Row(
                            mainAxisAlignment:
                            MainAxisAlignment
                                .spaceBetween,
                            children: [

                              Text(
                                "Section",
                                style: TextStyle(
                                  fontWeight:
                                  FontWeight.w500,
                                ),
                              ),

                              Icon(
                                Icons.keyboard_arrow_down,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  /// 🔹 HEADER ROW
                  Row(
                    children: [

                      Expanded(
                        flex: 4,
                        child: Text(
                          "Student",
                          style: TextStyle(
                            fontWeight:
                            FontWeight.w700,
                            color: Colors
                                .grey
                                .shade700,
                          ),
                        ),
                      ),

                      Expanded(
                        child: Text(
                          "P",
                          textAlign:
                          TextAlign.center,
                          style: TextStyle(
                            fontWeight:
                            FontWeight.w700,
                            color: Colors
                                .green
                                .shade700,
                          ),
                        ),
                      ),

                      Expanded(
                        child: Text(
                          "A",
                          textAlign:
                          TextAlign.center,
                          style: TextStyle(
                            fontWeight:
                            FontWeight.w700,
                            color:
                            Colors.red.shade700,
                          ),
                        ),
                      ),

                      Expanded(
                        child: Text(
                          "%",
                          textAlign:
                          TextAlign.end,
                          style: const TextStyle(
                            fontWeight:
                            FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  Divider(
                    color:
                    Colors.grey.shade200,
                  ),
                ],
              ),
            ),

            /// 🔽 BODY
            Expanded(
              child: FutureBuilder(
                future: Future.wait([
                  fetchStudents(),
                  fetchAttendance(),
                ]),

                builder: (
                    context,
                    snapshot,
                    ) {

                  if (!snapshot.hasData) {
                    return const Center(
                      child:
                      CircularProgressIndicator(),
                    );
                  }

                  final results =
                  snapshot.data as List;

                  final students =
                  results[0]
                  as List<
                      QueryDocumentSnapshot>;

                  final attendanceDocs =
                      (results[1]
                      as QuerySnapshot)
                          .docs;

                  /// 🔥 CALCULATE
                  final stats =
                  calculateStats(
                    attendanceDocs,
                  );

                  if (students.isEmpty) {
                    return const Center(
                      child:
                      Text("No students found"),
                    );
                  }

                  return ListView.builder(
                    padding:
                    const EdgeInsets.fromLTRB(
                      20,
                      0,
                      20,
                      20,
                    ),

                    itemCount: students.length,

                    itemBuilder:
                        (context, index) {

                      final data =
                      students[index].data()
                      as Map<String,
                          dynamic>;

                      final id =
                          students[index].id;

                      final name =
                          data['name'] ??
                              "Student";

                      final student =
                          stats[id] ?? {
                            'present': 0,
                            'total': 0,
                          };

                      final present =
                      student['present']!;

                      final total =
                      student['total']!;

                      final absent =
                          total - present;

                      final percent =
                      getPercentage(
                        present,
                        total,
                      );

                      return Container(
                        padding:
                        const EdgeInsets.symmetric(
                          vertical: 16,
                        ),

                        decoration:
                        BoxDecoration(
                          border: Border(
                            bottom:
                            BorderSide(
                              color: Colors
                                  .grey
                                  .shade200,
                            ),
                          ),
                        ),

                        child: Row(
                          children: [

                            Expanded(
                              flex: 4,
                              child: Text(
                                name,
                                style:
                                const TextStyle(
                                  fontSize: 15,
                                  fontWeight:
                                  FontWeight.w500,
                                ),
                              ),
                            ),

                            Expanded(
                              child: Text(
                                "$present",
                                textAlign:
                                TextAlign.center,
                                style:
                                TextStyle(
                                  color: Colors
                                      .green
                                      .shade700,
                                  fontWeight:
                                  FontWeight.w600,
                                ),
                              ),
                            ),

                            Expanded(
                              child: Text(
                                "$absent",
                                textAlign:
                                TextAlign.center,
                                style:
                                TextStyle(
                                  color: Colors
                                      .red
                                      .shade700,
                                  fontWeight:
                                  FontWeight.w600,
                                ),
                              ),
                            ),

                            Expanded(
                              child: Text(
                                "${percent.toStringAsFixed(0)}%",
                                textAlign:
                                TextAlign.end,
                                style:
                                TextStyle(
                                  color: percent >= 75
                                      ? Colors.green
                                      .shade700
                                      : Colors.red
                                      .shade700,
                                  fontWeight:
                                  FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterTab({
    required String title,
    required String value,
  }) {

    final isSelected =
        selectedFilter == value;

    return GestureDetector(
      onTap: () {
        setState(() {
          selectedFilter = value;
        });
      },

      child: AnimatedContainer(
        duration:
        const Duration(milliseconds: 220),

        padding:
        const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 10,
        ),

        decoration: BoxDecoration(
          color: isSelected
              ? Colors.black
              : Colors.transparent,

          borderRadius:
          BorderRadius.circular(30),

          border: Border.all(
            color: isSelected
                ? Colors.black
                : Colors.grey.shade300,
          ),
        ),

        child: Text(
          title,
          style: TextStyle(
            color: isSelected
                ? Colors.white
                : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}