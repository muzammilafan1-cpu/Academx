import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'admin_notices_screen.dart';
import 'admin_attendance_screen.dart';
import 'admin_students_attendance_screen.dart';

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  String? institutionId;
  bool isLoading = true;
  Color? primary;

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
    institutionId = data?['institutionId'];

    // 🔥 ADD THIS
    final instDoc = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .get();

    final hexColor = instDoc.data()?['primaryColor'];

    if (hexColor != null) {
      primary = Color(int.parse(hexColor.replaceAll('#', '0xFF')));
    }

    setState(() {
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      backgroundColor: primary ?? Colors.white,

      body: SafeArea(
        child: isLoading
            ? const Center(child: CircularProgressIndicator(color: Colors.white))
            : Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// 🔹 HEADER
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 20, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Admin Dashboard",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    "Manage your school",
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),

            /// 🔹 BODY
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFF5F5F5),
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    children: [

                      /// 📢 NOTICES
                      _card(
                        title: "Notices",
                        icon: Icons.campaign,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AdminNoticesScreen(
                                institutionId: institutionId!,
                              ),
                            ),
                          );
                        },
                      ),

                      /// 📊 ATTENDANCE
                      _card(
                        title: "Attendance",
                        icon: Icons.check_circle,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AdminAttendanceScreen(
                                institutionId: institutionId!,
                              ),
                            ),
                          );
                        },
                      ),

                      /// 👥 STUDENTS
                      _card(
                        title: "Students attendance",
                        icon: Icons.people,
                        onTap: () {
                          if (institutionId == null) return;

                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AdminStudentsAttendanceScreen(
                                institutionId: institutionId!,
                              ),
                            ),
                          );
                        },
                      ),

                      /// 📚 CLASSES
                      _card(
                        title: "Classes",
                        icon: Icons.class_,
                        onTap: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text("Coming soon")),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 🔹 CARD
  Widget _card({
    required String title,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: const [
            BoxShadow(color: Colors.black12, blurRadius: 6),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 36),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}