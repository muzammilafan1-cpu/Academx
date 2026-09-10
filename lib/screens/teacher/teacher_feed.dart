import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:school_app/screens/alerts/alerts_screen.dart';
import '../posts/create_post.dart';
import 'teacher_dashboard.dart';
import 'teacher_home.dart';
import 'teacher_schedule_screen.dart';

class TeacherMainScreen extends StatefulWidget {
  const TeacherMainScreen({super.key});

  @override
  State<TeacherMainScreen> createState() => _TeacherMainScreenState();
}

class _TeacherMainScreenState extends State<TeacherMainScreen> {

  int _currentIndex = 0;

  late PageController _pageController;

  Color institutionColor = Colors.black;

  bool loading = true;

  String institutionId = "";
  String userRole = "";

  // ❌ REMOVED const → VERY IMPORTANT
  List<Widget> _screens = [];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    fetchInstitutionColor();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> fetchInstitutionColor() async {

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

      if (colorHex != null) {
        institutionColor = hexToColor(colorHex);
      }

      institutionId = instId;

      // ✅ BUILD SCREENS AFTER DATA IS READY
      _screens = [
        const TeacherHome(),
        const AlertsScreen(),
        TeacherScheduleScreen(
          institutionColor: institutionColor,
        ),
        const TeacherDashboard(),
      ];

      setState(() {
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

  void _onItemTapped(int index) {

    setState(() {
      _currentIndex = index;
    });

    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {

    if (loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(

      body: PageView(
        controller: _pageController,
        onPageChanged: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        children: _screens,
      ),

      // ✅ FAB (UNCHANGED)
      floatingActionButton: _currentIndex == 0
          ? FloatingActionButton(
        backgroundColor: Colors.white,
        elevation: 6,
        child: Icon(
          Icons.add,
          color: institutionColor,
        ),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const CreatePostScreen(),
            ),
          );
        },
      )
          : null,

      bottomNavigationBar: BottomNavigationBar(

        currentIndex: _currentIndex,
        onTap: _onItemTapped,

        type: BottomNavigationBarType.fixed,

        selectedItemColor: institutionColor,
        unselectedItemColor: institutionColor.withValues(alpha: 0.45),

        items: [

          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: "Home",
          ),

          BottomNavigationBarItem(
            icon: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('alerts')
                  .where('institutionId', isEqualTo: institutionId)
                  .where('targetRoles', arrayContains: userRole)
                  .where('read', isEqualTo: false)
                  .snapshots(),
              builder: (context, snapshot) {

                int count = 0;

                if (snapshot.hasData) {
                  count = snapshot.data!.docs.length;
                }

                return Stack(
                  children: [

                    const Icon(Icons.notifications),

                    if (count > 0)
                      Positioned(
                        right: 0,
                        top: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.red,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          child: Text(
                            count.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
            label: "Alerts",
          ),

          // 🔥 RENAMED TAB (OPTIONAL BUT BETTER)
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_today_outlined),
            activeIcon: Icon(Icons.calendar_today),
            label: "Schedule",
          ),

          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard),
            label: "Dashboard",
          ),
        ],
      ),
    );
  }
}