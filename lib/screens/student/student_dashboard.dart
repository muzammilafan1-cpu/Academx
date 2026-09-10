import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'attendance_screen.dart';
import 'package:school_app/screens/student/student_diary_screen.dart';
import 'student_project_screen.dart';
import 'student_notice_screen.dart';

class StudentDashboard extends StatefulWidget {
  const StudentDashboard({super.key});

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  String institutionName = "";
  Color institutionColor = Colors.blue;
  bool loading = true;

  String? institutionId;

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

    /// ✅ GET institutionId (ONLY THIS LINE IS NEEDED)
    institutionId = userDoc.data()?['institutionId'];

    if (institutionId != null) {
      final instDoc = await FirebaseFirestore.instance
          .collection('institutions')
          .doc(institutionId)
          .get();

      final colorHex = instDoc.data()?['primaryColor'];

      institutionName = instDoc.data()?['name'] ?? "";

      if (colorHex != null) {
        institutionColor = hexToColor(colorHex);
      }

      setState(() {
        loading = false;
      });
    }
  }
  Color hexToColor(String hex) {
    final buffer = StringBuffer();
    if (hex.length == 6 || hex.length == 7) buffer.write('ff');
    buffer.write(hex.replaceFirst('#', ''));
    return Color(int.parse(buffer.toString(), radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      body: SingleChildScrollView(
        child: Column(
          children: [

            /// 🔵 HEADER (UNCHANGED)
            Container(
              height: 260,
              width: double.infinity,
              padding: const EdgeInsets.only(
                top: 55,
                left: 20,
                right: 20,
              ),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    institutionColor,
                    institutionColor.withOpacity(0.9),
                  ],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [

                  Row(
                    children: [
                      const Icon(Icons.location_on,
                          color: Colors.white, size: 16),
                      const SizedBox(width: 6),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            institutionName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            "Road no 1, Hyderabad, Telangana",
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.85),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  const Text(
                    "Welcome, Student",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            /// ⚪ WHITE SECTION
            Container(
              width: double.infinity,
              transform: Matrix4.translationValues(0, -40, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(30),
                ),
              ),
              child: Column(
                children: [

                  const SizedBox(height: 20),

                  /// 🔥 DASHBOARD CARD
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.06),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [

                        /// DASHBOARD PILL
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: institutionColor,
                            borderRadius: BorderRadius.circular(30),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.home,
                                  color: Colors.white, size: 18),
                              SizedBox(width: 6),
                              Text(
                                "Dashboard",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 28),

                        /// ✅ ICON ROW
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [

                            dashboardItem(
                              icon: Icons.check_circle_outline,
                              label: "Attendance",
                              onTap: () {
                                if (institutionId == null) return;

                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => AttendanceScreen(
                                      institutionId: institutionId!,
                                    ),
                                  ),
                                );
                              },
                            ),

                            dashboardItem(
                              icon: Icons.menu_book_outlined,
                              label: "Diary",
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                    StudentDiaryScreen(),
                                  ),
                                );
                              },
                            ),


                            dashboardItem(
                              icon: Icons.assignment_outlined,
                              label: "Project",
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => const StudentProjectScreen(),
                                  ),
                                );
                              },
                            ),
                            dashboardItem(
                              icon: Icons.campaign_outlined,
                              label: "Notices",
                              onTap: () {
                                if (institutionId == null) return;

                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => StudentNoticeScreen(
                                      institutionId: institutionId!,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 30),

                  /// BELOW SECTION
                  Padding(
                    padding:
                    const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment:
                      MainAxisAlignment.spaceBetween,
                      children: [

                        const Text(
                          "Attendance for this Month",
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),

                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(
                                color: Colors.grey.shade300),
                            borderRadius:
                            BorderRadius.circular(20),
                          ),
                          child: const Row(
                            children: [
                              Text("APR"),
                              SizedBox(width: 6),
                              Icon(Icons.calendar_today, size: 14),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 🔹 ICON WIDGET
  Widget dashboardItem({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [

          Container(
            width: 70,
            height: 70,
            decoration: BoxDecoration(
              color: Colors.blueGrey.shade50,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              icon,
              size: 28,
              color: Colors.black87,
            ),
          ),

          const SizedBox(height: 8),

          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}