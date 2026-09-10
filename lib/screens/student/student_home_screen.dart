import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../profile/profile_screen.dart';
import 'package:intl/intl.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {

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

    return Color(int.parse(buffer.toString(), radix: 16));
  }

  Future<void> refreshFeed() async {
    await fetchInstitution();
  }

  @override
  Widget build(BuildContext context) {

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
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment:
                MainAxisAlignment.spaceBetween,

                children: [

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [

                        Text(
                          institutionName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
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

                            const begin = Offset(1.0, 0.0);
                            const end = Offset.zero;

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
                              animation.drive(tween),
                              child: child,
                            );
                          },
                        ),
                      );
                    },

                    child: Container(
                      padding: const EdgeInsets.all(10),

                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),

                        borderRadius:
                        BorderRadius.circular(14),
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

                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                ),

                child: RefreshIndicator(

                  color: institutionColor,

                  onRefresh: refreshFeed,

                  child: StreamBuilder<QuerySnapshot>(

                    stream: FirebaseFirestore.instance
                        .collection('posts')
                        .where(
                      'institutionId',
                      isEqualTo: institutionId,
                    )
                        .orderBy(
                      'createdAt',
                      descending: true,
                    )
                        .snapshots(),

                    builder: (context, snapshot) {

                      if (snapshot.connectionState ==
                          ConnectionState.waiting) {

                        return const Center(
                          child: CircularProgressIndicator(),
                        );
                      }

                      if (!snapshot.hasData ||
                          snapshot.data!.docs.isEmpty) {

                        return ListView(
                          padding: const EdgeInsets.all(24),

                          children: [

                            const SizedBox(height: 80),

                            Icon(
                              Icons.campaign_outlined,
                              size: 52,
                              color: Colors.grey.shade400,
                            ),

                            const SizedBox(height: 14),

                            const Center(
                              child: Text(
                                "No announcements yet",

                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight:
                                  FontWeight.w600,
                                ),
                              ),
                            ),

                            const SizedBox(height: 6),

                            Center(
                              child: Text(
                                "Check back later for updates",

                                style: TextStyle(
                                  color:
                                  Colors.grey.shade600,
                                ),
                              ),
                            ),
                          ],
                        );
                      }

                      final posts = snapshot.data!.docs;

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

                              final post =
                              posts[index].data()
                              as Map<String, dynamic>;

                              return buildPostCard(
                                index: index,
                                title: post['title'] ?? "",
                                description:
                                post['description'] ?? "",
                                createdAt:
                                post['createdAt'],
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

  Widget buildPostCard({
    required int index,
    required String title,
    required String description,
    required dynamic createdAt,
  }) {

    String date = "";

    if (createdAt != null) {

      final timestamp = createdAt as Timestamp;
      final d = timestamp.toDate();

      date = DateFormat('d MMM yyyy').format(d);
    }

    String initials = "";

    final parts = institutionName.split(" ");

    if (parts.length >= 2) {
      initials = parts[0][0] + parts[1][0];
    } else if (parts.isNotEmpty) {
      initials = parts[0][0];
    }

    bool expanded = expandedPosts[index] ?? false;

    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: 18,
      ),

      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Colors.grey.shade200,
          ),
        ),
      ),

      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          // ================= POST HEADER =================

          Row(
            children: [

              CircleAvatar(
                radius: 18,

                backgroundColor:
                institutionColor.withOpacity(0.12),

                backgroundImage:
                institutionLogo.isNotEmpty
                    ? NetworkImage(institutionLogo)
                    : null,

                child: institutionLogo.isEmpty
                    ? Text(
                  initials.toUpperCase(),

                  style: TextStyle(
                    color: institutionColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                )
                    : null,
              ),

              const SizedBox(width: 12),

              Expanded(
                child: Column(
                  crossAxisAlignment:
                  CrossAxisAlignment.start,

                  children: [

                    Text(
                      institutionName,

                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),

                    const SizedBox(height: 2),

                    Text(
                      date,

                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // ================= TITLE =================

          Text(
            title,

            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              height: 1.3,
            ),
          ),

          const SizedBox(height: 10),

          // ================= DESCRIPTION =================

          Text(
            description,

            maxLines: expanded ? null : 4,

            overflow: expanded
                ? TextOverflow.visible
                : TextOverflow.ellipsis,

            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade800,
              height: 1.5,
            ),
          ),

          if (description.length > 120)
            GestureDetector(

              onTap: () {
                setState(() {
                  expandedPosts[index] = !expanded;
                });
              },

              child: Padding(
                padding: const EdgeInsets.only(top: 10),

                child: Text(
                  expanded
                      ? "Show less"
                      : "Read more",

                  style: TextStyle(
                    color: institutionColor,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}