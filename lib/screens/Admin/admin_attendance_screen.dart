import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

class AdminAttendanceScreen extends StatefulWidget {
  final String institutionId;

  const AdminAttendanceScreen({
    super.key,
    required this.institutionId,
  });

  @override
  State<AdminAttendanceScreen> createState() =>
      _AdminAttendanceScreenState();
}

class _AdminAttendanceScreenState
    extends State<AdminAttendanceScreen> {

  String selectedFilter = "7days";

  /// 🔹 DATE LIST
  List<String> getDates() {
    final now = DateTime.now();

    if (selectedFilter == "7days") {
      return List.generate(7, (index) {
        final date = now.subtract(Duration(days: index));
        return DateFormat('yyyy-MM-dd').format(date);
      });
    }

    if (selectedFilter == "month") {
      final start = DateTime(now.year, now.month, 1);
      final days = now.difference(start).inDays + 1;

      return List.generate(days, (index) {
        final date = start.add(Duration(days: index));
        return DateFormat('yyyy-MM-dd').format(date);
      }).reversed.toList();
    }

    return List.generate(60, (index) {
      final date = now.subtract(Duration(days: index));
      return DateFormat('yyyy-MM-dd').format(date);
    });
  }

  String formatDate(String date) {
    return DateFormat('dd MMM')
        .format(DateTime.parse(date));
  }

  String getDayLabel(String date) {
    final parsed = DateTime.parse(date);
    final today = DateTime.now();

    if (DateFormat('yyyy-MM-dd').format(today) == date) {
      return "Today";
    }

    if (DateFormat('yyyy-MM-dd')
        .format(
      today.subtract(const Duration(days: 1)),
    ) ==
        date) {
      return "Yesterday";
    }

    return DateFormat('EEE').format(parsed);
  }

  @override
  Widget build(BuildContext context) {
    final dates = getDates();

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// 🔹 HEADER
            Padding(
              padding: const EdgeInsets.fromLTRB(
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
                    "Attendance Report",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),

                  const SizedBox(height: 4),

                  Text(
                    "Track class attendance records",
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),

                  const SizedBox(height: 16),

                  const Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),

                  /// 🔹 FILTER TABS
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [

                        _buildFilterTab(
                          title: "7 Days",
                          value: "7days",
                        ),

                        const SizedBox(width: 10),

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
                  ),

                  const SizedBox(height: 16),

                  const Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),
                ],
              ),
            ),

            /// 🔽 BODY
            Expanded(
              child: FutureBuilder<QuerySnapshot>(
                future: FirebaseFirestore.instance
                    .collection('classes')
                    .where(
                  'institutionId',
                  isEqualTo:
                  widget.institutionId,
                )
                    .get(),
                builder:
                    (context, classSnapshot) {

                  if (!classSnapshot.hasData) {
                    return const Center(
                      child:
                      CircularProgressIndicator(),
                    );
                  }

                  final classes =
                      classSnapshot.data!.docs;

                  return ListView.builder(
                    padding:
                    const EdgeInsets.fromLTRB(
                      20,
                      0,
                      20,
                      20,
                    ),
                    itemCount: classes.length,
                    itemBuilder:
                        (context, index) {

                      final classData =
                      classes[index].data()
                      as Map<String,
                          dynamic>;

                      final className =
                      classData['class']
                          .toString();

                      final sections =
                      classData['sections']
                      as List;

                      return Column(
                        crossAxisAlignment:
                        CrossAxisAlignment
                            .start,
                        children: sections
                            .map((section) {

                          return StreamBuilder<
                              QuerySnapshot>(
                            stream:
                            FirebaseFirestore
                                .instance
                                .collection(
                              'attendance_v2',
                            )
                                .where(
                              'institutionId',
                              isEqualTo:
                              widget
                                  .institutionId,
                            )
                                .snapshots(),

                            builder: (
                                context,
                                snapshot,
                                ) {

                              if (!snapshot
                                  .hasData) {
                                return const SizedBox();
                              }

                              /// 🔥 FILTER
                              final docs = snapshot
                                  .data!.docs
                                  .where((doc) {

                                final d =
                                doc.data()
                                as Map<
                                    String,
                                    dynamic>;

                                return d['class']
                                    .toString() ==
                                    className &&
                                    d['section']
                                        .toString() ==
                                        section
                                            .toString();
                              }).toList();

                              /// 🔥 EXISTING DATES
                              final existingDates =
                              docs.map((doc) {

                                final d =
                                doc.data()
                                as Map<
                                    String,
                                    dynamic>;

                                return d['date']
                                    ?.toString()
                                    .trim() ??
                                    '';
                              }).where((d) {
                                return d.isNotEmpty;
                              }).toList();

                              return Container(
                                margin:
                                const EdgeInsets
                                    .only(
                                  bottom: 28,
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                  CrossAxisAlignment
                                      .start,
                                  children: [

                                    /// 🔹 CLASS TITLE
                                    Text(
                                      "Class $className - $section",
                                      style:
                                      const TextStyle(
                                        fontSize: 17,
                                        fontWeight:
                                        FontWeight
                                            .w700,
                                      ),
                                    ),

                                    const SizedBox(
                                      height: 16,
                                    ),

                                    /// 🔹 ATTENDANCE ROWS
                                    Column(
                                      children:
                                      dates.map(
                                            (date) {

                                          final exists =
                                          existingDates
                                              .any(
                                                (d) =>
                                            d ==
                                                date,
                                          );

                                          return Container(
                                            margin:
                                            const EdgeInsets
                                                .only(
                                              bottom:
                                              10,
                                            ),
                                            padding:
                                            const EdgeInsets.symmetric(
                                              horizontal:
                                              16,
                                              vertical:
                                              16,
                                            ),
                                            decoration:
                                            BoxDecoration(
                                              color: Colors
                                                  .white,
                                              borderRadius:
                                              BorderRadius.circular(
                                                16,
                                              ),
                                              border:
                                              Border.all(
                                                color: Colors
                                                    .grey
                                                    .shade200,
                                              ),
                                            ),

                                            child: Row(
                                              children: [

                                                Expanded(
                                                  child:
                                                  Text(
                                                    formatDate(
                                                      date,
                                                    ),
                                                    style:
                                                    const TextStyle(
                                                      fontWeight:
                                                      FontWeight.w600,
                                                    ),
                                                  ),
                                                ),

                                                Expanded(
                                                  child:
                                                  Text(
                                                    getDayLabel(
                                                      date,
                                                    ),
                                                    style:
                                                    TextStyle(
                                                      color:
                                                      Colors.grey.shade600,
                                                    ),
                                                  ),
                                                ),

                                                Container(
                                                  padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal:
                                                    12,
                                                    vertical:
                                                    6,
                                                  ),
                                                  decoration:
                                                  BoxDecoration(
                                                    color: exists
                                                        ? const Color(
                                                      0xFFE8F5E9,
                                                    )
                                                        : const Color(
                                                      0xFFFFEBEE,
                                                    ),
                                                    borderRadius:
                                                    BorderRadius.circular(
                                                      30,
                                                    ),
                                                  ),

                                                  child:
                                                  Text(
                                                    exists
                                                        ? "Completed"
                                                        : "Pending",
                                                    style:
                                                    TextStyle(
                                                      color: exists
                                                          ? Colors.green.shade700
                                                          : Colors.red.shade700,
                                                      fontWeight:
                                                      FontWeight.w600,
                                                      fontSize:
                                                      12,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          );
                                        },
                                      ).toList(),
                                    ),

                                    const SizedBox(
                                      height: 6,
                                    ),

                                    Divider(
                                      color: Colors
                                          .grey
                                          .shade200,
                                    ),
                                  ],
                                ),
                              );
                            },
                          );
                        }).toList(),
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