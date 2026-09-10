import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class StudentDiaryScreen extends StatefulWidget {
  const StudentDiaryScreen({super.key});

  @override
  State<StudentDiaryScreen> createState() =>
      _StudentDiaryScreenState();
}

class _StudentDiaryScreenState
    extends State<StudentDiaryScreen> {

  String? institutionId;
  String? studentClass;
  String? studentSection;

  bool loading = true;

  @override
  void initState() {
    super.initState();
    fetchStudentData();
  }

  /// 🔥 GET STUDENT INFO
  Future<void> fetchStudentData() async {

    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) return;

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
                    "Diary",
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
                  'diary',
                )
                    .where(
                  'institutionId',
                  isEqualTo:
                  institutionId,
                )
                    .where(
                  'class',
                  isEqualTo:
                  studentClass,
                )
                    .where(
                  'section',
                  isEqualTo:
                  studentSection,
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

                  if (snapshot.hasError) {

                    return Center(
                      child: Text(
                        "Error: ${snapshot.error}",
                      ),
                    );
                  }

                  if (!snapshot
                      .hasData ||
                      snapshot.data!.docs
                          .isEmpty) {

                    return const Center(
                      child: Text(
                        "No diary entries yet",
                      ),
                    );
                  }

                  final docs =
                      snapshot.data!.docs;

                  return ListView.builder(
                    padding:
                    const EdgeInsets.fromLTRB(
                      20,
                      0,
                      20,
                      20,
                    ),

                    itemCount:
                    docs.length,

                    itemBuilder:
                        (context, index) {

                      final data =
                      docs[index];

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

                            /// 🔹 TITLE
                            Text(
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

                            const SizedBox(
                              height: 16,
                            ),

                            /// 🔹 CONTENT
                            Text(
                              data['content'] ??
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

                            /// 🔹 CLASS INFO
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

                                  child: const Text(
                                    "Diary",

                                    style:
                                    TextStyle(
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