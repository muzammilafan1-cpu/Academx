import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

class StudentScheduleScreen extends StatefulWidget {
  const StudentScheduleScreen({super.key});

  @override
  State<StudentScheduleScreen> createState() => _StudentScheduleScreenState();
}

class _StudentScheduleScreenState extends State<StudentScheduleScreen> {
  String institutionId = "";
  String selectedClass = "";
  String selectedSection = "";
  String selectedDate = "";
  Color? primary;
  bool isLoading = true;

  List<Map<String, dynamic>> periods = [];
  List<Map<String, String>> dateList = [];

  @override
  void initState() {
    super.initState();
    initStudentData();
  }

  /// =========================
  /// STEP 1 + STEP 2
  /// =========================
  Future<void> initStudentData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    /// 🔹 USERS COLLECTION (LOGIN)
    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    /// 🔹 Institution colour
    institutionId = userDoc.data()?['institutionId'] ?? "";
    final instDoc = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .get();

    final hexColor = instDoc.data()?['primaryColor'];

    if (hexColor != null) {
      primary = Color(int.parse(hexColor.replaceAll('#', '0xFF')));
    }

    final userEmail = userDoc.data()?['email'] ?? "";

    /// 🔹 INSTITUTION USERS (CLASS + SECTION)
    final studentSnap = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .collection('users')
        .where('email', isEqualTo: userEmail)
        .limit(1)
        .get();

    if (studentSnap.docs.isNotEmpty) {
      final data = studentSnap.docs.first.data();

      selectedClass = (data['class'] ?? "").toString().trim();
      selectedSection = (data['section'] ?? "").toString().trim();
    }

    /// 🔹 GENERATE DATES
    generateDates();

    /// 🔹 FETCH TIMETABLE
    await fetchTimetable();
  }

  /// =========================
  /// STEP 3 — DATE LIST
  /// =========================
  void generateDates() {
    DateTime today = DateTime.now();

    dateList = List.generate(7, (index) {
      DateTime date = today.add(Duration(days: index));

      return {
        "day": DateFormat('EEE').format(date),
        "date": DateFormat('dd').format(date),
        "fullDate": DateFormat('yyyy-MM-dd').format(date),
      };
    });

    selectedDate = dateList[0]["fullDate"]!;
  }

  /// =========================
  /// STEP 4 — FETCH TIMETABLE
  /// =========================
  Future<void> fetchTimetable() async {
    if (selectedDate.isEmpty ||
        institutionId.isEmpty ||
        selectedClass.isEmpty ||
        selectedSection.isEmpty) {
      setState(() => isLoading = false);
      return;
    }

    setState(() => isLoading = true);

    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('timetable')
          .where('institutionId', isEqualTo: institutionId)
          .where('class', isEqualTo: selectedClass)
          .where('section', isEqualTo: selectedSection)
          .where('date', isEqualTo: selectedDate)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {

        setState(() {
          periods = [];
          isLoading = false;
        });
        return;
      }

      final data = snapshot.docs.first.data();

      List temp = [];

      for (var p in data['periods']) {
        if ((p['startTime'] ?? "").toString().isEmpty ||
            (p['endTime'] ?? "").toString().isEmpty) continue;

        temp.add(p);
      }

      temp.sort((a, b) =>
          (a['startTime'] ?? "").compareTo(b['startTime'] ?? ""));

      setState(() {
        periods = List<Map<String, dynamic>>.from(temp);
        isLoading = false;
      });
    } catch (e) {
      setState(() => isLoading = false);
    }
  }

  /// =========================
  /// UI
  /// =========================
  @override
  Widget build(BuildContext context) {

    return Scaffold(
      backgroundColor: primary ?? Colors.white,

      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, // ✅ LEFT ALIGN
          children: [

            Container(
              height: 100, // 👈 control header height here
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              alignment: Alignment.bottomLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  const Text(
                    "My Schedule",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    selectedDate.isNotEmpty
                        ? DateFormat("EEEE · d MMM")
                        .format(DateTime.parse(selectedDate))
                        : "Loading...",
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),

            /// 🔽 BODY
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius:
                  BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: Column(
                  children: [

                    const SizedBox(height: 16),

                    /// 📅 DATE BAR (SAME AS ADMIN)
                    SizedBox(
                      height: 70,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: dateList.length,
                        itemBuilder: (context, index) {

                          final item = dateList[index];
                          final date =
                          DateTime.parse(item['fullDate']!);
                          final isSelected =
                              item['fullDate'] == selectedDate;
                          final dayName =
                          DateFormat('E').format(date);

                          return GestureDetector(
                            onTap: () async {
                              setState(() {
                                selectedDate = item['fullDate']!;
                              });
                              await fetchTimetable();
                            },
                            child: Container(
                              width: 60,
                              margin: const EdgeInsets.symmetric(horizontal: 6),
                              padding:
                              const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? primary
                                    : Colors.transparent,
                                borderRadius:
                                BorderRadius.circular(16),
                              ),
                              child: Column(
                                mainAxisAlignment:
                                MainAxisAlignment.center,
                                children: [
                                  Text(
                                    dayName,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isSelected
                                          ? Colors.white
                                          : Colors.grey,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    item['date']!,
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: isSelected
                                          ? Colors.white
                                          : Colors.black,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 10),

                    /// 📚 TIMELINE (EXACT ADMIN STYLE)
                    Expanded(
                      child: isLoading
                          ? const Center(
                          child: CircularProgressIndicator())
                          : periods.isEmpty
                          ? const Center(
                        child: Text("No schedule available"),
                      )
                          : ListView.builder(
                        padding:
                        const EdgeInsets.all(16),
                        itemCount: periods.length,
                        itemBuilder: (context, index) {
                          final item = periods[index];
                          return _timelineBlock(item);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
  Widget _timelineBlock(Map item) {
    final isBreak = item['type'] == "break";

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Text(item['startTime']),
              const SizedBox(height: 4),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: isBreak ? Colors.orange : Colors.grey,
                  shape: BoxShape.circle,
                ),
              ),
              Container(
                width: 2,
                height: 60,
                color: Colors.grey.shade300,
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isBreak
                    ? Colors.orange.withOpacity(0.2)
                    : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['subject'] ?? "Break"),
                  Text("${item['startTime']} - ${item['endTime']}"),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}