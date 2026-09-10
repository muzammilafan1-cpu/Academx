import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  String institutionId = "";
  String institutionLogo = "";
  String userRole = "";

  Color institutionColor = const Color(0xFF4F46E5);

  bool loading = true;

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

    final data = userDoc.data();

    final instId = data?['institutionId'];
    userRole = (data?['role'] ?? "").toLowerCase();

    if (instId != null) {
      final instDoc = await FirebaseFirestore.instance
          .collection('institutions')
          .doc(instId)
          .get();

      final colorHex = instDoc.data()?['primaryColor'];

      setState(() {
        institutionId = instId;
        institutionLogo = instDoc.data()?['logoUrl'] ?? "";

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

  Future<void> refreshAlerts() async {
    await fetchInstitution();
  }

  @override
  Widget build(BuildContext context) {
    if (loading || institutionId.isEmpty || userRole.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: institutionColor,

      body: SafeArea(
        child: Column(
          children: [

            /// 🔷 HEADER
            Container(
              height: 100,
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(
                16,
                16,
                16,
                8,
              ),
              alignment: Alignment.bottomLeft,
              color: institutionColor,

              child: const Text(
                "Alerts",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),

            /// 🔥 CONTENT
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                ),

                child: RefreshIndicator(
                  color: institutionColor,
                  onRefresh: refreshAlerts,

                  child: StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('alerts')
                        .where(
                      'institutionId',
                      isEqualTo: institutionId,
                    )
                        .where(
                      'targetRoles',
                      arrayContains: userRole,
                    )
                        .orderBy(
                      'createdAt',
                      descending: true,
                    )
                        .snapshots(),

                    builder: (context, snapshot) {

                      /// 🔄 LOADING
                      if (snapshot.connectionState ==
                          ConnectionState.waiting) {

                        return ListView(
                          physics:
                          const AlwaysScrollableScrollPhysics(),

                          children: const [

                            SizedBox(height: 300),

                            Center(
                              child:
                              CircularProgressIndicator(),
                            ),
                          ],
                        );
                      }

                      /// 📭 EMPTY
                      if (!snapshot.hasData ||
                          snapshot.data!.docs.isEmpty) {

                        return ListView(
                          physics:
                          const AlwaysScrollableScrollPhysics(),

                          children: const [

                            SizedBox(height: 200),

                            Center(
                              child: Text(
                                "No alerts yet",
                              ),
                            ),
                          ],
                        );
                      }

                      final alerts =
                          snapshot.data!.docs;

                      /// 📋 ALERT LIST
                      return ListView.builder(
                        physics:
                        const AlwaysScrollableScrollPhysics(),

                        padding: const EdgeInsets.only(
                          top: 22,
                        ),

                        itemCount: alerts.length,

                        itemBuilder: (context, index) {

                          final alert =
                          alerts[index].data()
                          as Map<String, dynamic>;

                          return buildAlertCard(
                            docId: alerts[index].id,
                            title: alert['title'] ?? "",
                            message:
                            alert['message'] ?? "",
                            createdAt:
                            alert['createdAt'],
                            read:
                            alert['read'] ?? false,
                            source:
                            alert['source'] ?? "",
                            referenceId:
                            alert['referenceId'] ?? "",
                          );
                        },
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

  Widget buildAlertCard({
    required String docId,
    required String title,
    required String message,
    required dynamic createdAt,
    required bool read,
    required String source,
    required String referenceId,
  }) {

    String timeAgo = "";

    if (createdAt != null) {

      final timestamp = createdAt as Timestamp;
      final d = timestamp.toDate();

      final difference =
      DateTime.now().difference(d);

      if (difference.inMinutes < 60) {

        timeAgo =
        "${difference.inMinutes}m ago";

      } else if (difference.inHours < 24) {

        timeAgo =
        "${difference.inHours}h ago";

      } else if (difference.inDays < 7) {

        timeAgo =
        "${difference.inDays} day ago";

      } else if (difference.inDays < 30) {

        timeAgo =
        "${(difference.inDays / 7).floor()} week ago";

      } else {

        timeAgo =
        "${(difference.inDays / 30).floor()} month ago";
      }
    }

    return Column(
      children: [

        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 14,
          ),
          child: Row(
            crossAxisAlignment:
            CrossAxisAlignment.start,
            children: [

              CircleAvatar(
                radius: 20,
                backgroundColor:
                institutionColor.withOpacity(0.12),
                backgroundImage:
                institutionLogo.isNotEmpty
                    ? NetworkImage(
                  institutionLogo,
                )
                    : null,
              ),

              const SizedBox(width: 14),

              Expanded(
                child: Column(
                  crossAxisAlignment:
                  CrossAxisAlignment.start,
                  children: [

                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),

                    const SizedBox(height: 4),

                    Text(
                      message,
                      style: const TextStyle(
                        fontSize: 15,
                        height: 1.35,
                      ),
                    ),

                    const SizedBox(height: 6),

                    Text(
                      timeAgo,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const Divider(
          height: 1,
          thickness: 0.8,
        ),
      ],
    );
  }

  void openSource(String source, String referenceId) {}
}