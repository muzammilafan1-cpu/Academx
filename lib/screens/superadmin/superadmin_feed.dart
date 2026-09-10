import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../posts/create_post.dart';
import 'superadmin_dashboard.dart';
import 'superadmin_home.dart';
import '../alerts/alerts_screen.dart';

class SuperAdminMainScreen extends StatefulWidget {
  const SuperAdminMainScreen({super.key});

  @override
  State<SuperAdminMainScreen> createState() => _SuperAdminMainScreenState();
}Color hexToColor(String hex) {

  final buffer = StringBuffer();

  if (hex.length == 7 || hex.length == 6) {
    buffer.write('ff');
  }

  buffer.write(hex.replaceFirst('#', ''));

  return Color(int.parse(buffer.toString(), radix: 16));
}

class _SuperAdminMainScreenState extends State<SuperAdminMainScreen> {

  int _currentIndex = 0;

  late PageController _pageController;

  Color institutionColor = Colors.black;

  String institutionId = "";
  String userRole = "";

  final List<Widget> _screens = const [
    SuperAdminHome(),
    AlertsScreen(),
    Placeholder(),
    SuperAdminDashboard(),
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();

    /// Load user data
    fetchUserData();
  }

  /// Fetch role + institution
  Future<void> fetchUserData() async {

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final data = userDoc.data();

    institutionId = data?['institutionId'] ?? "";
    userRole = data?['role'] ?? "";

    /// Fetch institution color
    if (institutionId.isNotEmpty) {

      final instDoc = await FirebaseFirestore.instance
          .collection('institutions')
          .doc(institutionId)
          .get();

      final colorHex = instDoc.data()?['primaryColor'];

      if (colorHex != null) {
        institutionColor = hexToColor(colorHex);
      }
    }

    setState(() {});
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

      floatingActionButton: _currentIndex == 0
          ? FloatingActionButton(
        backgroundColor: Colors.white,
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
        selectedItemColor: institutionColor,
        unselectedItemColor: Colors.grey,
        onTap: _onItemTapped,
        type: BottomNavigationBarType.fixed,

        items: [

          const BottomNavigationBarItem(
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

          const BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            activeIcon: Icon(Icons.chat_bubble),
            label: "Chats",
          ),

          const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard),
            label: "Dashboard",
          ),
        ],
      ),
    );
  }
}