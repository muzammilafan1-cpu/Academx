import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../profile/profile_screen.dart';

class StaffHome extends StatefulWidget {
  final String role;

  const StaffHome({
    super.key,
    required this.role,
  });

  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {

  String institutionId = "";
  String institutionName = "";
  String institutionLogo = "";
  String institutionAddress = "";

  Color institutionColor = Colors.white;

  bool loading = true;

  Map<int, bool> expandedPosts = {};

  @override
  void initState() {
    super.initState();
    fetchInstitution();
  }

  Future<void> fetchInstitution() async {

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final instId = userDoc.data()?['institutionId'];

    if (instId != null) {

      final instDoc = await FirebaseFirestore.instance
          .collection('institutions')
          .doc(instId)
          .get();

      final colorHex = instDoc.data()?['primaryColor'];

      setState(() {

        institutionId = instId;
        institutionName = instDoc.data()?['name'] ?? "";
        institutionLogo = instDoc.data()?['logoUrl'] ?? "";
        institutionAddress = instDoc.data()?['address'] ?? "";

        if (colorHex != null) {
          institutionColor = hexToColor(colorHex);
        }

        loading = false;
      });
    }
  }

  Color hexToColor(String hex) {

    final buffer = StringBuffer();

    if (hex.length == 7 || hex.length == 6) {
      buffer.write('ff');
    }

    buffer.write(hex.replaceFirst('#', ''));

    return Color(
      int.parse(buffer.toString(), radix: 16),
    );
  }

  Future<void> deletePost(String id) async {

    await FirebaseFirestore.instance
        .collection('posts')
        .doc(id)
        .delete();
  }

  void editPost(
      String id,
      String currentTitle,
      String currentDescription,
      ) {

    final titleController =
    TextEditingController(text: currentTitle);

    final descriptionController =
    TextEditingController(text: currentDescription);

    showDialog(
      context: context,

      builder: (context) {

        return AlertDialog(

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),

          title: const Text(
            "Edit Announcement",
          ),

          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [

                TextField(
                  controller: titleController,

                  decoration: InputDecoration(
                    labelText: "Title",

                    border: OutlineInputBorder(
                      borderRadius:
                      BorderRadius.circular(14),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                TextField(
                  controller: descriptionController,
                  maxLines: 5,

                  decoration: InputDecoration(
                    labelText: "Description",

                    border: OutlineInputBorder(
                      borderRadius:
                      BorderRadius.circular(14),
                    ),
                  ),
                ),
              ],
            ),
          ),

          actions: [

            TextButton(
              onPressed: () {
                Navigator.pop(context);
              },

              child: const Text("Cancel"),
            ),

            ElevatedButton(

              style: ElevatedButton.styleFrom(
                backgroundColor: institutionColor,
              ),

              onPressed: () async {

                await FirebaseFirestore.instance
                    .collection('posts')
                    .doc(id)
                    .update({

                  'title':
                  titleController.text.trim(),

                  'description':
                  descriptionController.text.trim(),
                });

                Navigator.pop(context);
              },

              child: const Text(
                "Save",
                style: TextStyle(
                  color: Colors.white,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> refreshFeed() async {
    await fetchInstitution();
  }

  @override
  Widget build(BuildContext context) {

    final currentUser =
        FirebaseAuth.instance.currentUser;

    if (loading) {
      return Scaffold(
        backgroundColor: institutionColor,
        body: const Center(
          child: CircularProgressIndicator(
            color: Colors.white,
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: institutionColor,

      body: SafeArea(
        child: Column(
          children: [

            // ================= HEADER =================

            Padding(
              padding: const EdgeInsets.fromLTRB(
                20,
                18,
                20,
                24,
              ),

              child: Row(
                mainAxisAlignment:
                MainAxisAlignment.spaceBetween,

                crossAxisAlignment:
                CrossAxisAlignment.start,

                children: [

                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                      CrossAxisAlignment.start,

                      children: [

                        Text(
                          institutionName,

                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight:
                            FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 4),

                        Text(
                          institutionAddress,

                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),

                  GestureDetector(
                    onTap: () {

                      Navigator.of(context).push(
                        PageRouteBuilder(
                          pageBuilder:
                              (
                              context,
                              animation,
                              secondaryAnimation,
                              ) {
                            return const ProfileScreen();
                          },

                          transitionsBuilder:
                              (
                              context,
                              animation,
                              secondaryAnimation,
                              child,
                              ) {

                            const begin =
                            Offset(1.0, 0.0);

                            const end =
                                Offset.zero;

                            final tween = Tween(
                              begin: begin,
                              end: end,
                            ).chain(
                              CurveTween(
                                curve: Curves.ease,
                              ),
                            );

                            return SlideTransition(
                              position:
                              animation.drive(
                                tween,
                              ),
                              child: child,
                            );
                          },
                        ),
                      );
                    },

                    child: Container(
                      padding:
                      const EdgeInsets.all(10),

                      decoration: BoxDecoration(
                        color:
                        Colors.white.withOpacity(
                          0.15,
                        ),

                        borderRadius:
                        BorderRadius.circular(
                          14,
                        ),
                      ),

                      child: const Icon(
                        Icons.person_rounded,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ================= WHITE BODY =================

            Expanded(
              child: Container(
                width: double.infinity,

                decoration: const BoxDecoration(
                  color: Colors.white,

                  borderRadius:
                  BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                ),

                child: RefreshIndicator(
                  color: institutionColor,

                  onRefresh: refreshFeed,

                  child: StreamBuilder<QuerySnapshot>(

                    stream: FirebaseFirestore
                        .instance
                        .collection('posts')
                        .where(
                      'institutionId',
                      isEqualTo:
                      institutionId,
                    )
                        .orderBy(
                      'createdAt',
                      descending: true,
                    )
                        .snapshots(),

                    builder: (context, snapshot) {

                      if (!snapshot.hasData) {

                        return const Center(
                          child:
                          CircularProgressIndicator(),
                        );
                      }

                      final posts =
                          snapshot.data!.docs;

                      if (posts.isEmpty) {

                        return ListView(
                          padding:
                          const EdgeInsets.all(
                            24,
                          ),

                          children: [

                            const SizedBox(
                              height: 80,
                            ),

                            Icon(
                              Icons
                                  .campaign_outlined,
                              size: 52,
                              color: Colors
                                  .grey
                                  .shade400,
                            ),

                            const SizedBox(
                              height: 14,
                            ),

                            const Center(
                              child: Text(
                                "No announcements yet",

                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight:
                                  FontWeight
                                      .w600,
                                ),
                              ),
                            ),

                            const SizedBox(
                              height: 6,
                            ),

                            Center(
                              child: Text(
                                "Check back later for updates",

                                style: TextStyle(
                                  color: Colors
                                      .grey
                                      .shade600,
                                ),
                              ),
                            ),
                          ],
                        );
                      }

                      return ListView(
                        padding: const EdgeInsets.fromLTRB(
                          18,
                          22,
                          18,
                          30,
                        ),

                        children: [

                          const Text(
                            "Announcements",

                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 18),

                          ...List.generate(
                            posts.length,
                                (index) {

                              final post = posts[index];

                              final data =
                              post.data()
                              as Map<String, dynamic>;

                              String date = "";

                              final createdAt =
                              data['createdAt'];

                              if (createdAt != null) {

                                final timestamp =
                                createdAt as Timestamp;

                                final d =
                                timestamp.toDate();

                                date =
                                "${d.day}/${d.month}/${d.year}";
                              }

                              final createdBy =
                                  data['createdBy'] ?? "";

                              final isOwner =
                                  createdBy ==
                                      currentUser!.uid;

                              bool canManage = false;

                              if (widget.role == "admin" ||
                                  widget.role ==
                                      "superadmin") {

                                canManage = true;
                              }

                              if (widget.role == "teacher" &&
                                  isOwner) {

                                canManage = true;
                              }

                              return Container(
                                padding:
                                const EdgeInsets.symmetric(
                                  vertical: 18,
                                ),

                                decoration: BoxDecoration(
                                  border: Border(
                                    bottom: BorderSide(
                                      color:
                                      Colors.grey.shade200,
                                    ),
                                  ),
                                ),

                                child: Column(
                                  crossAxisAlignment:
                                  CrossAxisAlignment.start,

                                  children: [

                                    Row(
                                      children: [

                                        CircleAvatar(
                                          radius: 18,

                                          backgroundColor:
                                          institutionColor
                                              .withOpacity(0.12),

                                          child: Text(
                                            institutionName
                                                .isNotEmpty
                                                ? institutionName
                                                .substring(0, 1)
                                                : "",

                                            style: TextStyle(
                                              color:
                                              institutionColor,

                                              fontWeight:
                                              FontWeight.bold,
                                            ),
                                          ),
                                        ),

                                        const SizedBox(width: 12),

                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                            CrossAxisAlignment.start,

                                            children: [

                                              Text(
                                                institutionName,

                                                style:
                                                const TextStyle(
                                                  fontSize: 14,
                                                  fontWeight:
                                                  FontWeight.w700,
                                                ),
                                              ),

                                              const SizedBox(height: 2),

                                              Text(
                                                date,

                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors
                                                      .grey
                                                      .shade600,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),

                                        if (canManage)
                                          PopupMenuButton<String>(

                                            onSelected: (value) {

                                              if (value == "edit") {

                                                editPost(
                                                  post.id,
                                                  data['title'] ?? "",
                                                  data['description'] ?? "",
                                                );
                                              }

                                              if (value == "delete") {

                                                deletePost(post.id);
                                              }
                                            },

                                            itemBuilder:
                                                (context) => const [

                                              PopupMenuItem(
                                                value: "edit",
                                                child: Text("Edit"),
                                              ),

                                              PopupMenuItem(
                                                value: "delete",
                                                child: Text("Delete"),
                                              ),
                                            ],
                                          ),
                                      ],
                                    ),

                                    const SizedBox(height: 14),

                                    Text(
                                      data['title'] ?? "",

                                      style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.bold,
                                        height: 1.3,
                                      ),
                                    ),

                                    const SizedBox(height: 10),

                                    Text(
                                      data['description'] ?? "",

                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Colors.grey.shade800,
                                        height: 1.5,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}