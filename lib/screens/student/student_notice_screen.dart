import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';

class StudentNoticeScreen extends StatefulWidget {
  final String institutionId;

  const StudentNoticeScreen({
    super.key,
    required this.institutionId,
  });

  @override
  State<StudentNoticeScreen> createState() =>
      _StudentNoticeScreenState();
}

class _StudentNoticeScreenState
    extends State<StudentNoticeScreen> {

  String? userClass;
  String? userSection;
  String? userId;

  bool loading = true;

  String selectedTab = "recent";

  @override
  void initState() {
    super.initState();
    fetchStudentData();
  }

  /// 🔥 FETCH USER
  Future<void> fetchStudentData() async {

    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) return;

    userId = user.uid;

    final doc =
    await FirebaseFirestore.instance
        .collection('institutions')
        .doc(widget.institutionId)
        .collection('users')
        .doc(user.uid)
        .get();

    final data = doc.data();

    userClass = data?['class'];
    userSection = data?['section'];

    setState(() {
      loading = false;
    });
  }

  /// 🔥 FILTER LOGIC
  bool shouldShow(
      Map<String, dynamic> data,
      ) {

    final type = data['targetType'];

    if (type == "all") return true;

    if (type == "class") {
      return data['class'] == userClass &&
          data['section'] ==
              userSection;
    }

    if (type == "individual") {

      List ids =
          data['studentIds'] ?? [];

      return ids.contains(userId);
    }

    return false;
  }

  /// 🔥 FORMAT DATE
  String formatDate(
      Timestamp timestamp,
      ) {

    final date = timestamp.toDate();

    return DateFormat(
      "dd MMM yyyy • hh:mm a",
    ).format(date);
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
                    "Notices",
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

                  /// 🔹 TABS
                  Row(
                    children: [

                      _buildTab(
                        title: "Recent",
                        value: "recent",
                      ),

                      const SizedBox(width: 10),

                      _buildTab(
                        title: "Previous",
                        value: "previous",
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  Divider(
                    color:
                    Colors.grey.shade200,
                    thickness: 1,
                  ),
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
                  'notices',
                )
                    .where(
                  'institutionId',
                  isEqualTo:
                  widget
                      .institutionId,
                )
                    .orderBy(
                  'createdAt',
                  descending: true,
                )
                    .snapshots(),

                builder: (
                    context,
                    snapshot,
                    ) {

                  if (snapshot.hasError) {
                    return Center(
                      child: Text(
                        "${snapshot.error}",
                      ),
                    );
                  }

                  if (!snapshot.hasData) {
                    return const Center(
                      child:
                      CircularProgressIndicator(),
                    );
                  }

                  final docs =
                      snapshot.data!.docs;

                  final filtered =
                  docs.where((doc) {

                    final data =
                    doc.data()
                    as Map<String,
                        dynamic>;

                    return shouldShow(
                      data,
                    );
                  }).toList();

                  if (filtered.isEmpty) {
                    return const Center(
                      child: Text(
                        "No notices available",
                      ),
                    );
                  }

                  /// 🔥 RECENT TAB
                  if (selectedTab ==
                      "recent") {

                    final latest =
                        filtered.first;

                    final data =
                    latest.data()
                    as Map<String,
                        dynamic>;

                    final timestamp =
                    data['createdAt']
                    as Timestamp?;

                    return SingleChildScrollView(
                      padding:
                      const EdgeInsets.all(
                        24,
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
                              fontSize: 28,
                              fontWeight:
                              FontWeight
                                  .bold,
                              height: 1.3,
                            ),
                          ),

                          const SizedBox(
                            height: 18,
                          ),

                          /// 🔹 DATE
                          if (timestamp != null)
                            Text(
                              formatDate(
                                timestamp,
                              ),
                              style:
                              TextStyle(
                                fontSize:
                                14,
                                color: Colors
                                    .grey
                                    .shade600,
                              ),
                            ),

                          const SizedBox(
                            height: 24,
                          ),

                          Divider(
                            color: Colors
                                .grey
                                .shade200,
                          ),

                          const SizedBox(
                            height: 24,
                          ),

                          /// 🔹 MESSAGE
                          Text(
                            data['message'] ??
                                "",
                            style:
                            const TextStyle(
                              fontSize: 17,
                              height: 1.7,
                              color:
                              Colors.black87,
                            ),
                          ),

                          const SizedBox(
                            height: 32,
                          ),

                          /// 🔹 NOTICE TYPE
                          Container(
                            padding:
                            const EdgeInsets.symmetric(
                              horizontal:
                              14,
                              vertical:
                              8,
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
                              _getNoticeLabel(
                                data[
                                'targetType'],
                              ),
                              style:
                              const TextStyle(
                                fontWeight:
                                FontWeight
                                    .w600,
                                fontSize:
                                13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  /// 🔥 PREVIOUS TAB
                  final previous =
                  filtered.length > 1
                      ? filtered
                      .sublist(1)
                      : [];

                  if (previous.isEmpty) {
                    return const Center(
                      child: Text(
                        "No previous notices",
                      ),
                    );
                  }

                  return ListView.builder(
                    padding:
                    const EdgeInsets.all(
                      20,
                    ),

                    itemCount:
                    previous.length,

                    itemBuilder:
                        (context, index) {

                      final data =
                      previous[index]
                          .data()
                      as Map<
                          String,
                          dynamic>;

                      final timestamp =
                      data['createdAt']
                      as Timestamp?;

                      return Container(
                        margin:
                        const EdgeInsets.only(
                          bottom: 14,
                        ),

                        padding:
                        const EdgeInsets.symmetric(
                          horizontal:
                          18,
                          vertical:
                          20,
                        ),

                        decoration:
                        BoxDecoration(
                          color:
                          Colors.white,

                          borderRadius:
                          BorderRadius.circular(
                            18,
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
                                16,
                                fontWeight:
                                FontWeight
                                    .bold,
                              ),
                            ),

                            const SizedBox(
                              height: 10,
                            ),

                            /// 🔹 MESSAGE
                            Text(
                              data['message'] ??
                                  "",
                              maxLines: 2,
                              overflow:
                              TextOverflow
                                  .ellipsis,
                              style:
                              TextStyle(
                                fontSize:
                                14,
                                color: Colors
                                    .grey
                                    .shade700,
                                height:
                                1.5,
                              ),
                            ),

                            const SizedBox(
                              height: 14,
                            ),

                            /// 🔹 DATE
                            if (timestamp !=
                                null)
                              Text(
                                formatDate(
                                  timestamp,
                                ),
                                style:
                                TextStyle(
                                  fontSize:
                                  12,
                                  color: Colors
                                      .grey
                                      .shade500,
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

  Widget _buildTab({
    required String title,
    required String value,
  }) {

    final isSelected =
        selectedTab == value;

    return GestureDetector(
      onTap: () {
        setState(() {
          selectedTab = value;
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

  String _getNoticeLabel(
      String? type,
      ) {

    switch (type) {
      case "class":
        return "Class Notice";

      case "individual":
        return "Personal Notice";

      default:
        return "General Notice";
    }
  }
}