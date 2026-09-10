import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'student_dashboard.dart';
import 'student_home_screen.dart';
import 'student_schedule_screen.dart';
import '../alerts/alerts_screen.dart';

class StudentMainScreen extends StatefulWidget {
  const StudentMainScreen({super.key});

  @override
  State<StudentMainScreen> createState() => _StudentMainScreenState();
}

class _StudentMainScreenState extends State<StudentMainScreen> {

  int _currentIndex = 0;

  late PageController _pageController;

  Color institutionColor = Colors.black;

  bool loading = true;

  String institutionId = "";

  late final List<Widget> _screens = [
    const HomeScreen(),
    const AlertsScreen(),
    const StudentScheduleScreen(),
    const StudentDashboard(),
  ];

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

  /// UNREAD ALERTS STREAM
  Stream<int> unreadAlertsCount() {

    final user = FirebaseAuth.instance.currentUser;

    return FirebaseFirestore.instance
        .collection('alerts')
        .where('institutionId', isEqualTo: institutionId)
        .snapshots()
        .map((snapshot) {

      int count = 0;

      for (var doc in snapshot.docs) {

        final data = doc.data();

        final alertUser = data['userId'] ?? "";
        final read = data['read'] ?? false;

        if (!read && (alertUser == "" || alertUser == user!.uid)) {
          count++;
        }
      }

      return count;
    });
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
      return const Center(child: CircularProgressIndicator());
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

      bottomNavigationBar: Container(
        margin: const EdgeInsets.all(14),

        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: institutionColor.withValues(alpha: 0.15),
              blurRadius: 20,
            )
          ],
        ),

        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),

          child: BottomNavigationBar(

            currentIndex: _currentIndex,

            onTap: _onItemTapped,

            type: BottomNavigationBarType.fixed,

            selectedItemColor: institutionColor,
            unselectedItemColor: institutionColor.withValues(alpha: 0.45),

            showUnselectedLabels: true,

            items: [

              const BottomNavigationBarItem(
                icon: Icon(Icons.home_outlined),
                activeIcon: Icon(Icons.home),
                label: "Home",
              ),

              /// ALERTS WITH BADGE
              BottomNavigationBarItem(

                label: "Alerts",

                icon: StreamBuilder<int>(

                  stream: unreadAlertsCount(),

                  builder: (context, snapshot) {

                    int count = snapshot.data ?? 0;

                    return Stack(
                      children: [

                        const Icon(Icons.notifications_outlined),

                        if (count > 0)
                          Positioned(
                            right: 0,
                            top: 0,

                            child: Container(
                              padding: const EdgeInsets.all(4),

                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),

                              constraints: const BoxConstraints(
                                minWidth: 16,
                                minHeight: 16,
                              ),

                              child: Text(
                                count.toString(),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),

                activeIcon: StreamBuilder<int>(

                  stream: unreadAlertsCount(),

                  builder: (context, snapshot) {

                    int count = snapshot.data ?? 0;

                    return Stack(
                      children: [

                        const Icon(Icons.notifications),

                        if (count > 0)
                          Positioned(
                            right: 0,
                            top: 0,

                            child: Container(
                              padding: const EdgeInsets.all(4),

                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),

                              constraints: const BoxConstraints(
                                minWidth: 16,
                                minHeight: 16,
                              ),

                              child: Text(
                                count.toString(),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),

              const BottomNavigationBarItem(
                icon: Icon(Icons.calendar_today_outlined),
                activeIcon: Icon(Icons.calendar_today),
                label: "Schedule",
              ),

              const BottomNavigationBarItem(
                icon: Icon(Icons.dashboard_outlined),
                activeIcon: Icon(Icons.dashboard),
                label: "Dashboard",
              ),
            ],
          ),
        ),
      ),
    );
  }
}