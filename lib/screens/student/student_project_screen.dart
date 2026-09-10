import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class StudentProjectScreen extends StatefulWidget {
  const StudentProjectScreen({super.key});

  @override
  State<StudentProjectScreen> createState() =>
      _StudentProjectScreenState();
}

class _StudentProjectScreenState
    extends State<StudentProjectScreen> {

  String? institutionId;
  String? studentClass;
  String? studentSection;
  String? studentUid;

  bool loading = true;

  @override
  void initState() {
    super.initState();
    fetchStudentData();
  }

  Future<void> fetchStudentData() async {

    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) return;

    studentUid = user.uid;

    final userDoc =
    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final data = userDoc.data();

    institutionId =
    data?['institutionId'];

    studentClass =
    data?['class'];

    studentSection =
    data?['section'];

    setState(() {
      loading = false;
    });
  }

  /// 🔥 FILTER LOGIC
  bool shouldShowProject(
      Map<String, dynamic> data,
      ) {

    final type = data['type'];

    /// CLASS PROJECT
    if (type == "class") {

      return data['class'] ==
          studentClass &&
          data['section'] ==
              studentSection;
    }

    /// GROUP PROJECT
    if (type == "group") {

      final List students =
          data['studentIds'] ?? [];

      return students.contains(
        studentUid,
      );
    }

    return false;
  }

  @override
  Widget build(BuildContext context) {

    if (loading) {

      return const Scaffold(
        body: Center(
          child:
          CircularProgressIndicator(),
        ),
      );
    }

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
                    "Projects",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight:
                      FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),

                  const SizedBox(height: 16),

                  Divider(
                    color:
                    Colors.grey.shade200,
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),
                ],
              ),
            ),

            /// 🔽 BODY
            Expanded(
              child:
              StreamBuilder<QuerySnapshot>(
                stream:
                FirebaseFirestore
                    .instance
                    .collection(
                  'projects',
                )
                    .where(
                  'institutionId',
                  isEqualTo:
                  institutionId,
                )
                    .orderBy(
                  'timestamp',
                  descending: true,
                )
                    .snapshots(),

                builder: (
                    context,
                    snapshot,
                    ) {

                  if (snapshot
                      .connectionState ==
                      ConnectionState
                          .waiting) {

                    return const Center(
                      child:
                      CircularProgressIndicator(),
                    );
                  }

                  if (!snapshot
                      .hasData ||
                      snapshot.data!.docs
                          .isEmpty) {

                    return const Center(
                      child: Text(
                        "No Projects Found",
                      ),
                    );
                  }

                  final docs =
                      snapshot.data!.docs;

                  /// 🔥 FILTER PROJECTS
                  final filtered =
                  docs.where((doc) {

                    final data =
                    doc.data()
                    as Map<String,
                        dynamic>;

                    return shouldShowProject(
                      data,
                    );
                  }).toList();

                  if (filtered.isEmpty) {

                    return const Center(
                      child: Text(
                        "No Projects Assigned",
                      ),
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

                    itemCount:
                    filtered.length,

                    itemBuilder:
                        (context, index) {

                      final data =
                      filtered[index]
                          .data()
                      as Map<
                          String,
                          dynamic>;

                      return Container(
                        margin:
                        const EdgeInsets.only(
                          bottom: 16,
                        ),

                        padding:
                        const EdgeInsets.symmetric(
                          horizontal:
                          20,
                          vertical:
                          22,
                        ),

                        decoration:
                        BoxDecoration(
                          color:
                          Colors.white,

                          borderRadius:
                          BorderRadius.circular(
                            20,
                          ),

                          border:
                          Border.all(
                            color: Colors
                                .grey
                                .shade200,
                          ),
                        ),

                        child: Column(
                          crossAxisAlignment:
                          CrossAxisAlignment
                              .start,
                          children: [

                            /// 🔹 TOP ROW
                            Row(
                              crossAxisAlignment:
                              CrossAxisAlignment
                                  .start,
                              children: [

                                Expanded(
                                  child: Text(
                                    data['title'] ??
                                        "",
                                    style:
                                    const TextStyle(
                                      fontSize:
                                      18,
                                      fontWeight:
                                      FontWeight
                                          .bold,
                                      height:
                                      1.4,
                                    ),
                                  ),
                                ),

                                const SizedBox(
                                  width: 12,
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
                                    color:
                                    const Color(
                                      0xFFF5F5F5,
                                    ),

                                    borderRadius:
                                    BorderRadius.circular(
                                      30,
                                    ),
                                  ),

                                  child: Text(
                                    data['type'] ==
                                        "group"
                                        ? "Group"
                                        : "Class",

                                    style:
                                    const TextStyle(
                                      fontSize:
                                      12,
                                      fontWeight:
                                      FontWeight
                                          .w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(
                              height: 18,
                            ),

                            /// 🔹 DESCRIPTION
                            Text(
                              data['description'] ??
                                  "",

                              style: TextStyle(
                                fontSize:
                                15,
                                height:
                                1.7,
                                color: Colors
                                    .grey
                                    .shade800,
                              ),
                            ),

                            const SizedBox(
                              height: 22,
                            ),

                            /// 🔹 BOTTOM ROW
                            Row(
                              children: [

                                Expanded(
                                  child: Text(
                                    "Class ${data['class']} - ${data['section']}",

                                    style:
                                    TextStyle(
                                      fontSize:
                                      13,
                                      color: Colors
                                          .grey
                                          .shade600,
                                      fontWeight:
                                      FontWeight
                                          .w500,
                                    ),
                                  ),
                                ),

                                Text(
                                  data['dueDate'] ??
                                      "",

                                  style:
                                  TextStyle(
                                    fontSize:
                                    13,
                                    color: Colors
                                        .red
                                        .shade400,
                                    fontWeight:
                                    FontWeight
                                        .w600,
                                  ),
                                ),
                              ],
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
}